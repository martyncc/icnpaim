import { Pool } from 'pg'

const pool = new Pool({
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    ssl: process.env.NODE_ENV == 'development' 
        ? false 
        : { rejectUnauthorized: false }
})

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle PostgreSQL client:', err)
    process.exit(-1)
})

export default pool