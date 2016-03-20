'use strict'
const path = require('path')
const Promise = require('bluebird')
const pgp = require('pg-promise')({promiseLib: Promise})
const Job = require('./job')
const _ = require('lodash')
const errors = require('./errors')

var jobHandlers = {}
var db
var self = this
var shutdown


function connect(connectionString) {
    db = pgp(connectionString)
}

function disconnect() {
    return pgp.end()
}

function installSchema() {
    var schema = path.join(__dirname, 'schema.sql')
    var qf = new pgp.QueryFile(schema)
    return db.none(qf)
}

function addHandlers(handlers) {
    _.extend(jobHandlers, handlers)
}

function clearHandlers() {
    jobHandlers.length = 0
}

function addJob(job) {
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
    
    return db.none('INSERT INTO "JobQueue" ("type", "data", "scheduledFor", "maxAttempts", "createdAt") VALUES (${type}, ${data}, ${scheduledFor}, ${maxAttempts}, NOW() )', job)
}

function processNextJob() {
    var types = _.keys(jobHandlers)
    return db.tx(function(t) {
        return t.func('pending_jobs', [1, types])
    }).then(function(results) {

        if (results.length != 1) {
            throw new errors.JobQueueEmpty()
        }

        var result = results[0]
        var handler = jobHandlers[result.type]
        var job = new Job(result, db)

        return Promise.try(function() {
            return jobHandlers[result.type](job)
        })
        .catch((e) => {
            return job.fail(e.message)
        })
    })
}

function processAllJobs() {
    return processNextJob().then(function() {
        return processAllJobs()
    })
}

function startProcessing() {
    function loop() {
        if (shutdown) {
            return Promise.resolve()
        }
        processNextJob().catch(function(e) {
            // ignore job errors because they are handled by processNextJob() and we must continue our loop
            
        })
        .finally(function() {
            return Promise.delay(1000).then(loop)
        })

    }
    setImmediate(loop)
}

function stopProcessing() {
    shutdown = true
}

function getFailedJobs() {
    return db.manyOrNone('SELECT * FROM "JobQueue" WHERE "state"=$1', 'failed')
}

function waitingCount() {
    return db.one('SELECT COUNT(*) FROM "JobQueue" WHERE "state"=$1', 'waiting').then(function(result) {
        return _.parseInt(result.count)
    })
}


exports.connect = connect
exports.disconnect = disconnect
exports.addHandlers = addHandlers
exports.clearHandlers = clearHandlers
exports.startProcessing = startProcessing
exports.processNextJob = processNextJob
exports.stopProcessing = stopProcessing
exports.addJob = addJob
exports.installSchema = installSchema
exports.getFailedJobs = getFailedJobs
exports.processAllJobs = processAllJobs
exports.waitingCount = waitingCount
exports.pgp = pgp
exports.errors = errors