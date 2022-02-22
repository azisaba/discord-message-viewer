const debug = require('debug')('discord-message-viewer:sql')
const { createPool } = require('mysql')
const pool = createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
})

module.exports.query = (sql, ...values) => {
    return new Promise((resolve, reject) => {
        debug(sql, values)
        pool.query(sql, values, (error, results, fields) => {
            if (error) {
                return reject(error)
            }
            resolve({ results, fields })
        })
    })
}
