'use strict'
const util = require('util')

function JobQueueEmpty() {
    Error.captureStackTrace(this, this.constructor)
    this.name = this.constructor.name
}

util.inherits(JobQueueEmpty, Error)

exports.JobQueueEmpty = JobQueueEmpty

