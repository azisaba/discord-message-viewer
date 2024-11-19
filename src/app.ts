import express from 'express'
import { query } from './sql'
import logger from 'morgan'
import path from 'path'
import createError from 'http-errors'
import cookieParser from 'cookie-parser'
import { router as indexRouter } from './routes/index'
import { router as uploadRouter } from './routes/upload'

const debug = require('debug')('discord-message-viewer:app')
query("SELECT 1").catch((e: any) => {
  console.error('Your mysql configuration is foobar, pls fix')
  console.error(e.stack || e)
  process.kill(process.pid, 'SIGINT')
})

const app = express()

// view engine setup
app.set('views', path.join(__dirname, '../views'))
app.set('view engine', 'pug')

app.use(logger('dev', {
  stream: {
    write: (s: string) => {
      debug(s.substring(0, s.length - 1)) // morgan tries to print \n, so we remove that here
    }
  }
}))

app.use('/', uploadRouter)

app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(cookieParser())
app.use(express.static(path.join(__dirname, '../public')))

app.use('/', indexRouter)

// catch 404 and forward to error handler
app.use(function(req: express.Request, res: express.Response, next: NextFunction) {
  next(createError(404))
})

// error handler
app.use(function(err: any, req: express.Request, res: express.Response, next: NextFunction) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  console.log(err.stack || err)
  res.status(err.status || 500)
  res.render('error')
})

export default app
