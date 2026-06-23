import client from '../../db/postgres'

let connected = false

async function ensureConnection() {
    if (!connected) {
        await client.connect()
        connected = true
    }
}

export async function getAllContents(unitId) {
    await ensureConnection()
    const res = await client.query('SELECT * FROM content WHERE unit_id=$1', [ unitId ])
    return res.rows
}

export async function createContent({ title, type, url, unitId }) {
    await ensureConnection()
    const res = await client.query(
        'INSERT INTO content (title, type, url, unit_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [ title, type || 'Contenido', url, unitId ]
    )
    return res.rows[0]
}

export async function updateContent({ id, title, type, url, unitId }) {
    await ensureConnection()
    const res = await client.query(
        `UPDATE content SET 
        title = $1,
        type = $2,
        url = $3,
        unit_id = $4
        WHERE id = $5 RETURNING *`,
        [ title, type || 'Contenido', url, unitId, id ]
    )
    return res.rows[0] || null
}

export async function deleteContent(id) {
    await ensureConnection()
    const res = await client.query(
        'DELETE FROM content WHERE id = $1 RETURNING *', 
        [ id ]
    )
    return res.rows[0] || null
}

export async function deleteByUnit(unitId) {
    await ensureConnection()
    const res = await client.query(
        'DELETE FROM content WHERE unit_id = $1 RETURNING *', 
        [ unitId ]
    )
    return res.rows || null
}
