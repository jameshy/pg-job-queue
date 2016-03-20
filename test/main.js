'use strict'
var Promise = require('bluebird')
var sinon = require('sinon')
var jobqueue = require('../lib')
var chai = require('chai')
var should = require('chai').should()
var expect = require('chai').expect
var chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
var bluebird = require('bluebird')
require('sinon-as-promised')(bluebird)

const connectionString = 'postgres://postgres@localhost/job-queue-test'

var pgDestroyCreate = require('pg-destroy-create-db')(connectionString)

describe('Job Queue', function() {

    beforeEach(function() {
        var destroyCreate = Promise.promisify(pgDestroyCreate.destroyCreate, {context: pgDestroyCreate})
        return destroyCreate()
        .then(() => {
            return jobqueue.connect(connectionString)
        })
        .then(jobqueue.installSchema)
        .then(jobqueue.clearHandlers).then(function() {
            return jobqueue.connect(connectionString)
        })
    })

    afterEach(function() {
        return jobqueue.disconnect()
    })

    it('should be able to add a job to the queue and it gets processed()', function() {

        function handler(job, jobqueue) {
            // send email to job.data.recipient, message=job.data.message
            return job.finish()
        }

        var spy = sinon.spy(handler)

        // setup a single job handler
        jobqueue.addHandlers({
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
                return jobqueue.processNextJob().should.eventually.be.rejected
            })
        })
    })

    it('should not retry a failed job with maxAttempts=1', function() {
        const errmsg = 'fatal error 123'

        jobqueue.addHandlers({
            failingJob: function() {
                throw new Error(errmsg)
            }
        })

        var job = {
            type: 'failingJob',
            maxAttempts: 0
        }

        return jobqueue.addJob(job)
        .then(jobqueue.processNextJob)
        .then(jobqueue.getFailedJobs)
        .then(function(jobs) {
            expect(jobs.length).to.equal(1)
            var job = jobs[0]
            job.failedAttempts.should.equal(1)
            job.lastFailureMessage.should.equal(errmsg)
        })
    })

    it('should retry a failed job `maxAttempts` times', function() {
        jobqueue.addHandlers({
            failingJob: function() {
                throw new Error('fail')
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
            if (!(e instanceof jobqueue.pgp.QueryResultError)) {
                throw e

            }
        }).then(function() {
            // job has been run many times and should have reached complete failure
            // check that is true
            return jobqueue.getFailedJobs().then(function(jobs) {
                expect(jobs.length).to.equal(1)
                var job = jobs[0]
                job.state.should.equal('failed')
                job.failedAttempts.should.equal(5)
                job.maxAttempts.should.equal(5)
            })
        })
    })

    // reshedule
    // should fail when job.fail() is called
    // should fail when an exception is thrown


})


