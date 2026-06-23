const contentServices = {
    updateContent: async (data) => {
        const { unitId } = data
        try {
            const response = await fetch(
                `/api/v2/units/${unitId}/contents`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }
            )
            if (!response.ok) {
                throw new Error(`Failed to update content: ${response.status}`)
            }
            const { content } = await response.json()
            return content
        } catch (error) {
            console.error('Error updating content:', error)
            throw error
        }
    },
    getAll: async (unitId) => {
        try {
            const response = await fetch(
                `/api/v2/units/${unitId}/contents`
            )
            if (!response.ok) {
                throw new Error(
                    `Failed to get all contents: ${response.status}`
                )
            }
            const { contents } = await response.json()
            return contents
        } catch (error) {
            console.error('Error getting all contents:', error)
            throw error
        }
    },
    delete: async (unitId, id) => {
        try {
            const response = await fetch(
                `/api/v2/units/${id}/contents`,
                { method: 'DELETE' }
            )
            if (!response.ok) {
                throw new Error(
                    `Failed to detele content: ${response.status}`
                )
            }
            await response.json()
            return
        } catch (error) {
            console.error('Error deleting content:', error)
            throw error
        }
    }
}

export default contentServices