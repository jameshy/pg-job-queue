'use strict'
const _ = require('lodash')

function Job(row, db) {
    _.extend(this, row)
    this.db = db
}

Job.prototype.finish = function() {
    return this.db.none('UPDATE "JobQueue" SET "state"=${state}, "lastRun"=NOW() WHERE "id"=${id}', {
        state: 'finished',
        id: this.id
    })
}

Job.prototype.destroy = function() {
    return this.db.none('DELETE FROM "JobQueue" WHERE "id"=${id}', {
        id: this.id
    })
}

Job.prototype.reschedule = function(date) {
    return this.db.none('UPDATE "JobQueue" SET "state"=${state}, "scheduledFor"=${scheduledFor} WHERE "id"=${id}', {
        state: 'waiting',
        id: this.id,
        scheduledFor: date
    })
}

Job.prototype.fail = function(failureMessage) {
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
                return this.db.none('UPDATE "JobQueue" SET "state"=${state} WHERE "id"=${id}', {
                    id: this.id,
                    state: 'waiting'
                })
            }
        })
    })
}

module.exports = Job