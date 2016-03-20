'use strict'
const util = require('util')

function JobQueueEmpty(message, extra) {
    Error.captureStackTrace(this, this.constructor)
    this.name = this.constructor.name
    this.message = message
    this.extra = extra
};

util.inherits(JobQueueEmpty, Error);

exports.JobQueueEmpty = JobQueueEmpty

