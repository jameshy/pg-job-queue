'use strict'
const path = require('path')
const Promise = require('bluebird')
const pgpOptions = {promiseLib: Promise}
const pgp = require('pg-promise')(pgpOptions)
const Job = require('./job')
const _ = require('lodash')
const errors = require('./errors')

// var monitor = require('pg-monitor')
// monitor.attach(pgpOptions)
// monitor.setTheme('matrix')

const nextJobSQL = new pgp.QueryFile(path.join(__dirname, './sql/nextJob.sql'))
var schemaPath = path.join(__dirname, 'schema.sql')
const schemaFile = new pgp.QueryFile(schemaPath, {minify: true})

function JobQueue(connectionString) {
    this.db = pgp(connectionString)
    this.jobHandlers = {}
    this.shutdown = false
    this.stopProcessingCallback = null
}

/*
Close all connections to the database.
This is useful because a node process won't gracefully end if there are connections open.
*/
JobQueue.prototype.disconnect = function() {
    pgp.end()
}

/*  Install schema to the database. */
JobQueue.prototype.installSchema = function() {
    return this.db.none(schemaFile)
}

/* Check that we can connect to the database and the table exists */
JobQueue.prototype.checkDatabase = function() {
    return this.db.oneOrNone('SELECT "id" FROM "JobQueue" LIMIT 1')
}

/* Clear the entire job queue. */
JobQueue.prototype.clearAllJobs = function() {
    return this.db.none('TRUNCATE table "JobQueue"')
}

/*
Set the job handlers, replacing any previous handlers.
This should be an object with a key of the job type, and value being the function for processing the job.
e.g.
{ sendEmail: (job) => { sendmail() }
*/
JobQueue.prototype.setHandlers = function(handlers) {
    this.jobHandlers = handlers
}

/* Add a job to the queue. */
JobQueue.prototype.addJob = function(job) {
    if (!_.isObject(job)) {
        throw new TypeError('job is not an object')
    }

    job.scheduledFor = job.scheduledFor || new Date()
    job.maxAttempts = job.maxAttempts || 1
    job.data = job.data || {}

    if (!job.type) {
        throw new TypeError("property 'type' not specified")
    }
    if (!_.isString(job.type)) {
        throw new TypeError("property 'type' is not a string")
    }
    if (!_.isDate(job.scheduledFor)) {
        throw new TypeError("property 'scheduledFor' is not a date")
    }
    if (!_.isNumber(job.maxAttempts)) {
        throw new TypeError("property 'maxAttempts' is not a number")
    }
    else if (job.maxAttempts < 0) {
        throw new TypeError("property 'maxAttempts' is negative")
    }

    var query = `
        INSERT INTO "JobQueue"
        ("type", "data", "scheduledFor", "maxAttempts", "createdAt")
        VALUES ($[type], $[data], $[scheduledFor], $[maxAttempts], NOW() )`

    return this.db.none(query, job)
}

/*
Determine the job types we can process by scanning handlers.
*/
JobQueue.prototype.getAvailableJobTypes = function() {
    function recurse(val, key) {

        if (_.isObject(val) && !_.isFunction(val)) {
            return _.map(val, (subval, subkey) => {
                var path = key + '.' + subkey
                return recurse(subval, path)
            })
        }
        else {
            return key
        }
    }

    return _(this.jobHandlers).map(recurse).flattenDeep().value()
}

/*
Resolve a job type to a job handler.
'job.path' will resolve to handlers.job.path if it exists
otherwise it will fallback to handlers['job.path']
*/
JobQueue.prototype.resolveHandler = function(path)
{
    // try and return the resolved path (e.g. handlers.job.path
    var byPath = _(this.jobHandlers).at(path).compact().head()
    if (byPath) {
        return byPath
    }
    else {
        // maybe there is a handler defined with the path (e.g. handlers['job.path'])
        return this.jobHandlers[path]
    }
}

/*
If $logHandler is a defined handler, call it.
*/
JobQueue.prototype.logEvent = function(event, job) {
    // if $logHandler is defined, call it
    if (this.jobHandlers.$logHandler) {
        this.jobHandlers.$logHandler(event, job)
    }
}

/*
If $errorHandler is a defined handler, call it.
*/
JobQueue.prototype.logError = function(error, job) {
    // if $errorHandler is defined, call it
    if (this.jobHandlers.$errorHandler) {
        this.jobHandlers.$errorHandler(error, job)
    }
}

/*
Grab the next job with a known handler, process it.
If no jobs are found, throw errors.JobQueueEmpty
*/
JobQueue.prototype.processNextJob = function() {
    // we only process jobs that we have a handler defined for
    // so get all these types ready to pass into the SQL query
    var types = this.getAvailableJobTypes()
    
    // we use a task, to ensure the same connection is used
    // this is important because we use a session-level advisory lock
    return this.db.task((t) => {
        // nextJobSQL acquires a session-level pg_advisory_lock
        return t.oneOrNone(nextJobSQL, {types: types})
        .then((result) => {
            if (!result) {
                throw new errors.JobQueueEmpty()
            }
            var job = new Job(result, this)

            return Promise.try(() => {
                var handler = this.resolveHandler(result.type)
                this.logEvent('starting', job)
                return handler(job)
            }).then(() => {
                // the job was not destroyed, finished or rescheduled
                // we mark the job as finished
                if (!job.handled) {
                    return job.finish()
                }
            })
            .catch((e) => {
                return job.fail(e)
            })
            .finally(() => {
                // release the advisory lock
                return t.one('SELECT pg_advisory_unlock($1)', result.id)
            })
        })
    })
}

/*
Process all jobs (one at a time).
When no jobs are available, throws errors.JobQueueEmpty
*/
JobQueue.prototype.processAllJobs = function() {
    return this.processNextJob().then(() => {
        return this.processAllJobs()
    })
}

/*
Begin an infinite loop of job-processing.
We continually poll for new jobs, waiting for $delay milliseconds between each poll. (default 500 milliseconds)
*/
JobQueue.prototype.startProcessing = function(delay) {
    var loop = function() {
        if (this.shutdown) {
            this.processing = false
            if (this.stopProcessingCallback) {
                if (this.jobHandlers.$shutdownHandler) {
                    return this.jobHandlers.$shutdownHandler().then(this.stopProcessingCallback)
                }
                else {
                    return this.stopProcessingCallback()
                }
            }
            return Promise.resolve()
        }
        return this.processAllJobs().catch((e) => {
            // ignore JobQueueEmpty exceptions, we must continue our loop
            if (!(e instanceof errors.JobQueueEmpty)) {
                throw e
            }
        })
        .then(() => {
            return Promise.delay(delay || 500).then(loop)
        })
    }
    loop = _.bind(loop, this)
    if (this.processing) {
        throw new Error("already processing")
    }
    this.processing = true
    return loop()
}

/*
Set a sentinel value to trigger termination of the startProcessing loop
*/
JobQueue.prototype.stopProcessing = function() {
    if (!this.processing) {
        return Promise.resolve()
    }
    this.shutdown = true

    return new Promise((fulfill) => {
        this.stopProcessingCallback = fulfill
    })
}

/* Returns all failed jobs (without locking) */
JobQueue.prototype.getFailedJobs = function() {
    return this.db.manyOrNone('SELECT * FROM "JobQueue" WHERE "state"=$1', 'failed')
}

/* Returns all jobs (without locking) */
JobQueue.prototype.getAllJobs = function() {
    return this.db.manyOrNone('SELECT * FROM "JobQueue"')
}

/* Returns current job queue length */
JobQueue.prototype.waitingCount = function() {
    return this.db.one('SELECT COUNT(*) FROM "JobQueue" WHERE "state"=$1', 'waiting').then((result) => {
        return _.parseInt(result.count)
    })
}

/* Returns number of failed jobs */
JobQueue.prototype.failedCount = function() {
    return this.db.one('SELECT COUNT(*) FROM "JobQueue" WHERE "state"=$1', 'failed').then((result) => {
        return _.parseInt(result.count)
    })
}

/*
Simplify access to our custome error types.
*/
JobQueue.prototype.errors = require('./errors')

module.exports = JobQueue

