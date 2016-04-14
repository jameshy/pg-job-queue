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
// monitor.setTheme('matrix');

const nextJobSQL = new pgp.QueryFile(path.join(__dirname, './sql/getJob.sql'))

function JobQueue(connectionString) {
    this.db = pgp(connectionString)
    this.jobHandlers = {}
    this.shutdown = false
    this.stopProcessingCallback = null
}

JobQueue.prototype.disconnect = function() {
    pgp.end()
}

JobQueue.prototype.installSchema = function() {
    var schema = path.join(__dirname, 'schema.sql')
    var qf = new pgp.QueryFile(schema, {minify: true})
    return this.db.none(qf)
}

JobQueue.prototype.clearAllJobs = function() {
    return this.db.none('TRUNCATE table "JobQueue"')
}

JobQueue.prototype.setHandlers = function(handlers) {
    this.jobHandlers = handlers
}

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
    
    return this.db.none('INSERT INTO "JobQueue" ("type", "data", "scheduledFor", "maxAttempts", "createdAt") VALUES (${type}, ${data}, ${scheduledFor}, ${maxAttempts}, NOW() )', job)
}

function formatArray(array) {
    var values = _.map(array, (n) => '"' + n + '"')
    return '{' + values.join(',') + '}'
}

JobQueue.prototype.processNextJob = function() {
    var types = _.keys(this.jobHandlers)

    return this.db.tx((t) => {
        return t.oneOrNone(nextJobSQL, {types: formatArray(types)})
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
        })
    })
}

JobQueue.prototype.processAllJobs = function() {
    return this.processNextJob().then(() => {
        return this.processAllJobs()
    })
}

JobQueue.prototype.startProcessing = function() {
    function loop() {
        if (this.shutdown) {
            if (this.stopProcessingCallback) {
                this.stopProcessingCallback()
            }
            return Promise.resolve()
        }
        return this.processNextJob().catch(function(e) {
            if (!(e instanceof errors.JobQueueEmpty)) {
                throw e
            }
            // ignore job errors because they are handled by processNextJob() and we must continue our loop
            
        })
        .finally(function() {
            return Promise.delay(1000).then(loop)
        })

    }
    return loop()
}

JobQueue.prototype.stopProcessing = function() {
    this.shutdown = true
    
    return new Promise(function(fulfill) {
        this.stopProcessingCallback = fulfill
    })
}

JobQueue.prototype.getFailedJobs = function() {
    return this.db.manyOrNone('SELECT * FROM "JobQueue" WHERE "state"=$1', 'failed')
}

JobQueue.prototype.waitingCount = function() {
    return this.db.one('SELECT COUNT(*) FROM "JobQueue" WHERE "state"=$1', 'waiting').then((result) => {
        return _.parseInt(result.count)
    })
}
JobQueue.prototype.errors = require('./errors')


module.exports = JobQueue