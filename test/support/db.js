'use strict'
var jobqueue = require('../../lib')

const connectionString = 'postgres://postgres@localhost/job-queue-test'

var pgDestroyCreate = require('pg-destroy-create-db')(connectionString)
var destroyCreate = Promise.promisify(pgDestroyCreate.destroyCreate, {context: pgDestroyCreate})


exports.destroyAndCreate = function() {
    // destroy and create database
    return destroyCreate()
    .then(() => {
        return jobqueue.connect(connectionString)
    })
    // import the schema
    .then(jobqueue.installSchema)
    // clear job-handlers
    .then(() => {
        return jobqueue.connect(connectionString)
    })
}
