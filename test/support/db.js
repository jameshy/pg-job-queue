'use strict'
var jobqueue = require('../../lib')

const connectionString = 'postgres://postgres@localhost/job-queue-test'

var pgDestroyCreate = require('pg-destroy-create-db')(connectionString)
var destroyCreate = Promise.promisify(pgDestroyCreate.destroyCreate, {context: pgDestroyCreate})


exports.destroyAndCreate = function() {
    // destroy and create database
    return destroyCreate()
    .then(() => {
        var queue = new jobqueue(connectionString)
        // import the schema
        return queue.installSchema().then(() => {
            return queue
        })
    })
}

exports.connectionString = connectionString