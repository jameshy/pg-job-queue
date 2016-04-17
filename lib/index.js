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

const nextJobSQL = new pgp.QueryFile(path.join(__dirname, './sql/getJob.sql'))
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
*/
JobQueue.prototype.disconnect = function() {
    pgp.end()
}

/*
Install schema to the database.
*/
JobQueue.prototype.installSchema = function() {
    return this.db.none(schemaFile)
}

/* Check that we can connect to the database and the table exists */
JobQueue.prototype.checkDatabase = function() {
    return this.db.oneOrNone('SELECT "id" FROM "JobQueue" LIMIT 1')
}

/*
Clear the entire job queue.
*/
JobQueue.prototype.clearAllJobs = function() {
    return this.db.none('TRUNCATE table "JobQueue"')
}

/*
Set the job handlers, replacing any previous handlers.
This should be an object with a key of the job type, and value being the function for processing the job.
e.g.
{ sendEmail: () => { sendmail() }
*/
JobQueue.prototype.setHandlers = function(handlers) {
    this.jobHandlers = handlers
}

/*
Add a job to the queue.
*/
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
Grab the next job with a known handler, process it.
If no jobs are found, throw errors.JobQueueEmpty
*/
JobQueue.prototype.processNextJob = function() {
    var types = _.keys(this.jobHandlers)

    // we use a task, to ensure the same connection is used
    // this is important because we use a session-level advisory lock
    return this.db.task((t) => {
        // nextJobSQL acquires a pg_advisory_lock
        return t.oneOrNone(nextJobSQL, {types: types})
        .then((result) => {
            if (!result) {
                throw new errors.JobQueueEmpty()
            }
            var job = new Job(result, this.db)

            return Promise.try(() => {
                return this.jobHandlers[result.type](job)
            })
            .catch((e) => {
                return job.fail(e.message)
            })
            .finally(() => {
                // release the advisory lock
                return t.one('SELECT pg_advisory_unlock("id") FROM "JobQueue" WHERE "id"=$1', result.id)
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
    function loop() {
        if (this.shutdown) {
            this.processing = false
            if (this.stopProcessingCallback) {
                this.stopProcessingCallback()
            }
            return Promise.resolve()
        }
        return this.processAllJobs().catch((e) => {
            // ignore JobQueueEmpty exceptions, we must continue our loop
            if (!(e instanceof errors.JobQueueEmpty)) {
                throw e
            }
        })
        .finally(() => {
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

JobQueue.prototype.stopProcessing = function() {
    if (!this.processing) {
        console.warn('stopProcessing was requested, but we are not currently processing.')
        return
    }
    this.shutdown = true
    
    return new Promise((fulfill) => {
        this.stopProcessingCallback = fulfill
    })
}

/*
Returns all failed jobs.
*/
JobQueue.prototype.getFailedJobs = function() {
    return this.db.manyOrNone('SELECT * FROM "JobQueue" WHERE "state"=$1', 'failed')
}

/*
Returns current job queue length
*/
JobQueue.prototype.waitingCount = function() {
    return this.db.one('SELECT COUNT(*) FROM "JobQueue" WHERE "state"=$1', 'waiting').then((result) => {
        return _.parseInt(result.count)
    })
}

JobQueue.prototype.errors = require('./errors')

module.exports = JobQueue