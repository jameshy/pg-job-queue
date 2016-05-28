'use strict'
const _ = require('lodash')

function Job(row, queue) {
    _.extend(this, row)
    this.queue = queue
    this.db = queue.db
    this.handled = false
}

Job.prototype.finish = function() {
    this.handled = true
    this.state = 'finished'
    return this.db.none('UPDATE "JobQueue" SET "state"=${state}, "lastRun"=NOW() WHERE "id"=${id}', {
        state: this.state,
        id: this.id
    })
    .then(() => this.queue.logEvent('finished', this))
}

Job.prototype.destroy = function() {
    this.handled = true
    this.state = 'destroyed'
    return this.db.none('DELETE FROM "JobQueue" WHERE "id"=${id}', {
        id: this.id
    })
    .then(() => this.queue.logEvent('destroyed', this))
}

Job.prototype.reschedule = function(date) {
    this.handled = true
    this.state = 'waiting'
    this.scheduledFor = date
    return this.db.none('UPDATE "JobQueue" SET "state"=${state}, "scheduledFor"=${scheduledFor} WHERE "id"=${id}', {
        state: this.state,
        id: this.id,
        scheduledFor: this.scheduledFor
    })
    .then(() => this.queue.logEvent('rescheduled', this))
    .then(() => this.queue.logEvent('finished', this))
}

Job.prototype.fail = function(error, rescheduleFor) {
    this.handled = true
    return this.db.none('UPDATE "JobQueue" SET "lastFailureMessage"=${failureMessage}, "failedAttempts"="failedAttempts"+1, "lastRun"=NOW() WHERE "id"=${id}', {
        id: this.id,
        failureMessage: error.message
    }).then(() => {
        return this.db.one('SELECT * FROM "JobQueue" WHERE "id"=${id}', {id: this.id}).then((result) => {
            if (result.failedAttempts >= result.maxAttempts) {
                // complete failure, ensure the job isn't run again
                this.state = 'failed'
                return this.db.none('UPDATE "JobQueue" SET "state"=${state} WHERE "id"=${id}', {
                    id: this.id,
                    state: this.state
                })
            }
            else {
                // reschedule the job to run in 3 minute
                var now = new Date()
                var minute = 3 * 60 * 1000
                this.scheduledFor = rescheduleFor || new Date(now.getTime() + minute)
                this.state = 'waiting'
                return this.db.none('UPDATE "JobQueue" SET "state"=${state}, "scheduledFor"=${scheduledFor} WHERE "id"=${id}', {
                    id: this.id,
                    state: this.state,
                    scheduledFor: this.scheduledFor
                })
            }
        })
    })
    .then(() => this.queue.logEvent('failed', this))
    .then(() => this.queue.logError(error, this))
}

module.exports = Job