'use strict'
require('./support/common')

var jobqueue = require('../lib')


describe('Interface', function() {
    it("must have function 'connect'", function() {
        expect(jobqueue.connect instanceof Function).to.be.true
    })
    
    it("must have function 'disconnect'", function() {
        expect(jobqueue.disconnect instanceof Function).to.be.true
    })

    it("must have function 'setHandlers'", function() {
        expect(jobqueue.setHandlers instanceof Function).to.be.true
    })

    it("must have function 'startProcessing'", function() {
        expect(jobqueue.startProcessing instanceof Function).to.be.true
    })

    it("must have function 'processNextJob'", function() {
        expect(jobqueue.processNextJob instanceof Function).to.be.true
    })

    it("must have function 'stopProcessing'", function() {
        expect(jobqueue.stopProcessing instanceof Function).to.be.true
    })

    it("must have function 'addJob'", function() {
        expect(jobqueue.addJob instanceof Function).to.be.true
    })

    it("must have function 'installSchema'", function() {
        expect(jobqueue.installSchema instanceof Function).to.be.true
    })

    it("must have function 'getFailedJobs'", function() {
        expect(jobqueue.getFailedJobs instanceof Function).to.be.true
    })

    it("must have function 'processAllJobs'", function() {
        expect(jobqueue.processAllJobs instanceof Function).to.be.true
    })

    it("must have function 'waitingCount'", function() {
        expect(jobqueue.waitingCount instanceof Function).to.be.true
    })

    it("must export 'pgp'", function() {
        expect(jobqueue.pgp instanceof require('pg-promise')).to.be.an.object
    })

})
