import client from '../../db/postgres'
import * as contentsHandler from './contents'
// import * as learningRoutesHandler from './learningRoutes'
/**
 * CRUD handlers for the Unit table in PostgreSQL.
 * 
 * Table schema:
 *   id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
 *   name     varchar(255) NOT NULL
 *   color    varchar(255)
 *   position INT NOT NULL
 */

let connected = false

async function ensureConnection() {
    if (!connected) {
        await client.connect()
        connected = true
    }
}

export async function getAllUnits() {
    await ensureConnection()
    const res = await client.query('SELECT * FROM unit ORDER BY position ASC')
    return res.rows
}

export async function getUnitById(id) {
    await ensureConnection()
    const res = await client.query(
        'SELECT * FROM unit WHERE id = $1',
        [ id ]
    )
    return res.rows[0] || null
}

export async function createUnit({ name, color, position }) {
    await ensureConnection()
    const bbId = '123' //mock blackBoard content Id

    const res = await client.query(
        'INSERT INTO unit (name, color, position, bb_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [ name, color || null, position, bbId ]
    )
    const newUnit = res.rows[0]
    /*
    const defaultGradesBreakPoint = [ 4,5.5 ]
    createLearningRoutes(
        newUnit,
        defaultGradesBreakPoint
    )
    */
    return newUnit
}

export async function updateUnit({ id, name, color, position }) {
    await ensureConnection()
    const res = await client.query(
        'UPDATE unit SET name = $1, color = $2, position = $3 WHERE id = $4 RETURNING *',
        [ name, color || null, position, id ]
    )
    return res.rows[0] || null
}

export async function deleteUnit(id) {
    await ensureConnection()
    await contentsHandler.deleteByUnit(id)

    const res = await client.query(
        'DELETE FROM unit WHERE id = $1 RETURNING *', 
        [ id ]
    )
    return res.rows[0] || null
}
