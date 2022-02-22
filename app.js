const createError = require('http-errors')
const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const logger = require('morgan')
const debug = require('debug')('discord-message-viewer:app')
const { query } = require('./src/sql')
query("SELECT 1").catch(e => {
  console.error('Your mysql configuration is foobar, pls fix')
  console.error(e.stack || e)
  process.kill(process.pid, 'SIGINT')
})

const indexRouter = require('./routes/index')

const app = express()

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev', {
  stream: {
    write: s => {
      debug(s.substring(0, s.length - 1)) // morgan tries to print \n, so we remove that here
    }
  }
}))
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
