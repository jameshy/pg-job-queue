'use strict'
const path = require('path')
const Promise = require('bluebird')
const pgp = require('pg-promise')({promiseLib: Promise})
const Job = require('./job')
const _ = require('lodash');

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
    return db.tx(function(t) {
        return t.one('SELECT * FROM pending_jobs(1)')
    }).then(function(result) {
        var handler = jobHandlers[result.type]
        if (!handler) {
            // no handler is defined, so ignore the job (but output a warning)
            console.warn("skipping job #{}, because no handler is available for type '{}'".format(result.id, result.type))
            return db.none('UPDATE "JobQueue" SET "state"=${state}', {state: 'waiting'})
        }
        var job = new Job(result, db)
        return Promise.try(function() {
            return jobHandlers[result.type](job, self)
        }).catch((e) => {
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
exports.pgp = pgp
