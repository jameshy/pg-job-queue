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
    return this.db.none('UPDATE "JobQueue" SET "state"=${state}, "scheduledFor"=${scheduledFor}, "lastRun"=${lastRun} WHERE "id"=${id}', {
        state: this.state,
        id: this.id,
        scheduledFor: this.scheduledFor,
        lastRun: new Date()
    })
    .then(() => this.queue.logEvent('rescheduled', this))
    .then(() => this.queue.logEvent('finished', this))
}

Job.prototype.fail = function (error, rescheduleFor) {
    let self = this;
    self.handled = true;
    return self.db.tx(function*(t) {
        yield t.none('UPDATE "JobQueue" SET "lastFailureMessage"=${failureMessage}, "failedAttempts"="failedAttempts"+1, "lastRun"=NOW() WHERE "id"=${id}', {
            id: self.id,
            failureMessage: error.message
        });
        let JobQueue = yield t.one('SELECT * FROM "JobQueue" WHERE "id"=${id}', {id: self.id});
        if (JobQueue.failedAttempts >= JobQueue.maxAttempts) {
            // complete failure, ensure the job isn't run again
            self.state = 'failed';
            return yield t.none('UPDATE "JobQueue" SET "state"=${state} WHERE "id"=${id}', {
                id: self.id,
                state: self.state
            });
        }
        // reschedule the job to run in 3 minute
        let now = new Date();
        let minute = 3 * 60 * 1000;
        self.scheduledFor = rescheduleFor || new Date(now.getTime() + minute);
        self.state = 'waiting';
        return yield t.none('UPDATE "JobQueue" SET "state"=${state}, "scheduledFor"=${scheduledFor} WHERE "id"=${id}', {
            id: self.id,
            state: self.state,
            scheduledFor: self.scheduledFor
        });
    })
        .then(() => self.queue.logEvent('failed', self))
        .then(() => self.queue.logError(error, self));
};

module.exports = Job
