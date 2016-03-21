'use strict'

require('./support/common')
const _ = require('lodash');
const destroyAndCreate = require('./support/db').destroyAndCreate
const jobqueue = require('../lib')


describe('Job Queue', function() {

    before(function() {
        // drop and create the database and install schema
        return destroyAndCreate()
    })

    beforeEach(function() {
        return jobqueue.clearAllJobs()
    })

    describe('addJob should throw an exception when called with invalid arguments', function() {
        this.validJob = {
            type: 'sendMail',
            scheduledFor: new Date(),
            maxAttempts: 1,
            data: {}
        }

        it('should reject non-objects', function() {
            expect(() => jobqueue.addJob(1)).to.throw(TypeError)
        })

        it('should reject scheduledFor specified with non-date', function() {
            var job = _.extend({}, this.validJob, {scheduledFor: 123})
            expect(() => jobqueue.addJob(job)).to.throw(TypeError)
        })

        it('should reject invalid type', function() {
            var job = _.extend({}, this.validJob, {type: 123})
            expect(() => jobqueue.addJob(job)).to.throw(TypeError)
        })

        it('should reject invalid maxAttempts', function() {
            var job = _.extend({}, this.validJob, {maxAttempts: 123})
            expect(() => jobqueue.addJob(job)).to.throw(TypeError)

            job = _.extend({}, this.validJob, {maxAttempts: -123})
            expect(() => jobqueue.addJob(job)).to.throw(TypeError)
        })

    })

    it('should accept a new job and then process it once', function() {

        function jobHandler(job, jobqueue) {
            // send email to job.data.recipient, message=job.data.message
            return job.finish()
        }

        var spy = sinon.spy(jobHandler)

        // setup a single job handler
        jobqueue.setHandlers({
            sendEmail: spy
        })

        var job = {
            type: 'sendEmail',
            data: {
                recipient: 'user@example.com',
                message: 'HELLO'
            }
        }


        // add a job
        return jobqueue.addJob(job).then(function() {
            // process the job
            return jobqueue.processNextJob().then(function() {

                // check the handler was called correctly
                expect(spy.calledOnce).to.be.true
                expect(spy.getCall(0).args[0].data).to.deep.equal(job.data)

                // try and process the job again (should fail)
                return expect(jobqueue.processNextJob()).to.eventually.be.rejected
            })
        })
    })

    it('should mark a job as failed if it throws an exception', function() {
        jobqueue.setHandlers({
            failingJob: function() {
                throw new Error('error message')
            }
        })

        var job = {
            type: 'failingJob',
            maxAttempts: 1
        }


        return jobqueue.addJob(job)
        .then(jobqueue.processNextJob)
        .then(jobqueue.getFailedJobs)
        .then(function(jobs) {

            expect(jobs.length).to.equal(1)
            var job = jobs[0]
            expect(job.failedAttempts).to.equal(1)
            expect(job.lastFailureMessage).to.equal('error message')
        })
    })

    it('should retry a failed job `maxAttempts` times', function() {
        jobqueue.setHandlers({
            failingJob: function() {
                throw new Error('error message')
            }
        })
        var job = {
            type: 'failingJob',
            maxAttempts: 5
        }
        return jobqueue.addJob(job)
        .then(function() {
            var loop = function() {
                return jobqueue.processNextJob().then(function() {
                    return loop()
                })
            }
            return loop()
        }).catch(function(e) {
            if (!(e instanceof jobqueue.errors.JobQueueEmpty)) {
                throw e
            }
        }).then(function() {
            // job has been run many times and should have reached complete failure
            // check that is true
            return jobqueue.getFailedJobs().then(function(jobs) {
                expect(jobs.length).to.equal(1)
                var job = jobs[0]
                expect(job.state).to.equal('failed')
                expect(job.failedAttempts).to.equal(5)
                expect(job.maxAttempts).to.equal(5)
                expect(job.lastFailureMessage).to.equal('error message')
            })
        })
    })

    it('should fail a job when job.fail() is called', function() {
        jobqueue.setHandlers({
            failingJob: function(job) {
                return job.fail('error message')
            }
        })
        var job = {
            type: 'failingJob'
        }
        return jobqueue.addJob(job)
        .then(function() {
            var loop = function() {
                return jobqueue.processNextJob().then(function() {
                    return loop()
                })
            }
            return loop()
        }).catch(function(e) {
            if (!(e instanceof jobqueue.errors.JobQueueEmpty)) {
                throw e
            }
        }).then(function() {
            // job has been run many times and should have reached complete failure
            // check that is true
            return jobqueue.getFailedJobs().then(function(jobs) {
                expect(jobs.length).to.equal(1)
                var job = jobs[0]
                expect(job.state).to.equal('failed')
                expect(job.failedAttempts).to.equal(1)
                expect(job.maxAttempts).to.equal(1)
                expect(job.lastFailureMessage).to.equal('error message')
            })
        })

    })

    it('should correctly reschedule a job', function() {
        jobqueue.setHandlers({
            rescheduleJob: function(job) {
                return job.reschedule(new Date())
            }
        })

        var job = {
            type: 'rescheduleJob',
        }

        return jobqueue.addJob(job)
        .then(jobqueue.processNextJob)
        .then(jobqueue.processNextJob)
        .then(jobqueue.waitingCount).then(function(count) {
            expect(count).to.equal(1)
        })
    })

    it('should only process jobs with handlers available', function() {
        var job = {
            type: 'sendmail',
        }
        return jobqueue.addJob(job)
        .then(function() {
            // processNextJob should throw the error JobQueueEmpty
            // because we haven't setup any handlers, so it doesn't see the job
            return expect(jobqueue.processNextJob()).to.eventually.be.rejectedWith(jobqueue.errors.JobQueueEmpty)
        })
    })
})


