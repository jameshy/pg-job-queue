# pg-job-queue

A job queue for node.js based on PostgreSQL.

[![npm version](https://badge.fury.io/js/pg-job-queue.svg)](https://badge.fury.io/js/pg-job-queue)
[![Build Status](https://travis-ci.org/jameshy/pg-job-queue.svg?branch=master)](https://travis-ci.org/jameshy/pg-job-queue)


## Installation
```bash
npm install pg-job-queue
```

## Create a job

```javascript
const jobqueue = require('pg-job-queue')
const queue = new jobqueue('postgres://postgres@localhost/my-job-queue')

queue.addJob({
    type: 'sendmail.welcome',
    data: {
        toAddress: 'demo@example.com',
        message: 'hello'
    }
})
```


## Processing jobs

The tool `process-job-queue` is provided for the continuous processing of jobs.  It will loop forever, polling the database for new jobs, until the process receives either SIGINT or SIGTERM.  If it's terminated while processing a job, it will finish that job before terminating.

The idea is that you define all your job handlers in a standard javascript module, and `process-job-queue` will call your handlers when it processes a job.

##### 1. Create handlers.js file
```javascript
module.exports = {
    sendmail: {
        welcome: function(job) {
            return sendMail(job.data.toAddress, job.data.message)
            .then(() => {
                return job.finish()
            })
        }
    }
}
```

Notice the handler above is nested, so will be invoked when a job is added with type 'sendmail.welcome'.

##### 2. Run process-job-queue
```bash
node_modules/pg-job-queue/bin/process-job-queue -f ./handlers.js -c postgres://postgres@localhost/my-job-queue
```

##### Special handler methods
You can define the following special handler methods:

* `$logHandler(action, job)` - for general purpose logging, it's called whenever something is about to happen on a job.  possible actions are: 'starting', 'destroyed', 'rescheduled', 'failed', 'finished'

* `$errorHandler(error, job)` - called whenever an uncaught exception occurs while running a job.

* `$shutdownHandler()` - called when we are stopping processing.  This is useful to close handles that would prevent the node process from terminating.

For example:
```javascript
module.exports = {
    $errorHandler: function(e, job) {
        console.error(e.stack)
    },
    $shutdownHandler: function() {
        return closeDatabaseConnection()
    },
    $logHandler: function(action, job) {
        console.log('job #{} ({}) - {}'.format(job.id, job.type, action))
    },
    normalJob: function(job) {
        return job.finish()
    }
}
```

## License
[MIT](LICENSE)
