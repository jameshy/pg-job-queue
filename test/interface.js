'use strict'
require('./support/common')

const jobqueue = require('../lib')
const db = require('./support/db')


describe('Interface', function() {
    beforeEach(function() {
        this.instance = new jobqueue(db.connectionString)
    })
    it('must be possible to instantiate a new instance', function() {
        expect(jobqueue instanceof Function).to.be.true
    })
    
    it("must have function 'disconnect'", function() {
        expect(this.instance.disconnect instanceof Function).to.be.true
    })

    it("must have function 'setHandlers'", function() {
        expect(this.instance.setHandlers instanceof Function).to.be.true
    })

    it("must have function 'startProcessing'", function() {
        expect(this.instance.startProcessing instanceof Function).to.be.true
    })

    it("must have function 'processNextJob'", function() {
        expect(this.instance.processNextJob instanceof Function).to.be.true
    })

    it("must have function 'stopProcessing'", function() {
        expect(this.instance.stopProcessing instanceof Function).to.be.true
    })

    it("must have function 'addJob'", function() {
        expect(this.instance.addJob instanceof Function).to.be.true
    })

    it("must have function 'installSchema'", function() {
        expect(this.instance.installSchema instanceof Function).to.be.true
    })

    it("must have function 'getFailedJobs'", function() {
        expect(this.instance.getFailedJobs instanceof Function).to.be.true
    })

    it("must have function 'processAllJobs'", function() {
        expect(this.instance.processAllJobs instanceof Function).to.be.true
    })

    it("must have function 'waitingCount'", function() {
        expect(this.instance.waitingCount instanceof Function).to.be.true
    })

    it("must export 'pgp'", function() {
        expect(this.instance.pgp instanceof require('pg-promise')).to.be.an.object
    })

})
