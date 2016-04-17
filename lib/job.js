'use strict'
const _ = require('lodash')

function Job(row, db) {
    _.extend(this, row)
    this.db = db
    this.handled = false
}

Job.prototype.finish = function() {
    this.handled = true
    return this.db.none('UPDATE "JobQueue" SET "state"=${state}, "lastRun"=NOW() WHERE "id"=${id}', {
        state: 'finished',
        id: this.id
    })
}

Job.prototype.destroy = function() {
    this.handled = true
    return this.db.none('DELETE FROM "JobQueue" WHERE "id"=${id}', {
        id: this.id
    })
}

Job.prototype.reschedule = function(date) {
    this.handled = true
    return this.db.none('UPDATE "JobQueue" SET "state"=${state}, "scheduledFor"=${scheduledFor} WHERE "id"=${id}', {
        state: 'waiting',
        id: this.id,
        scheduledFor: date
    })
}

Job.prototype.fail = function(failureMessage) {
    this.handled = true
    return this.db.none('UPDATE "JobQueue" SET "lastFailureMessage"=${failureMessage}, "failedAttempts"="failedAttempts"+1, "lastRun"=NOW() WHERE "id"=${id}', {
        id: this.id,
        failureMessage: failureMessage
    }).then(() => {
        return this.db.one('SELECT * FROM "JobQueue" WHERE "id"=${id}', {id: this.id}).then((result) => {
            if (result.failedAttempts >= result.maxAttempts) {
                // complete failure, ensure the job isn't run again
                return this.db.none('UPDATE "JobQueue" SET "state"=${state} WHERE "id"=${id}', {
                    id: this.id,
                    state: 'failed'
                })
            }
            else {
                // reschedule the job to run in 3 minute
                var now = new Date()
                var minute = 3 * 60 * 1000
                var rescheduledDate = new Date(now.getTime() + minute)
                return this.db.none('UPDATE "JobQueue" SET "state"=${state}, "scheduledFor"=${scheduledFor} WHERE "id"=${id}', {
                    id: this.id,
                    state: 'waiting',
                    scheduledFor: rescheduledDate
                })
            }
        })
    })
}

module.exports = Job