const unitServices = {
    updateUnit: async (data) => {
        try {
            const response = await fetch('/api/v2/units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            if (!response.ok) {
                throw new Error(`Failed to update unit: ${response.status}`)
            }
            const { unit } = await response.json()
            return unit
        } catch (error) {
            console.error('Error updating unit:', error)
            throw error
        }
    },
    getAll: async () => {
        try {
            const response = await fetch('/api/v2/units')
            if (!response.ok) {
                throw new Error(`Failed to get all units: ${response.status}`)
            }
            const { units } = await response.json()
            return units
        } catch (error) {
            console.error('Error getting all units:', error)
            throw error
        }
    },
    delete: async (id) => {
        try {
            const response = await fetch('/api/v2/units', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({id})
            })
            if (!response.ok) {
                throw new Error(`Failed to detele unit: ${response.status}`)
            }
            await response.json()
            return
        } catch (error) {
            console.error('Error deleting unit:', error)
            throw error
        }
    }
}

export default unitServices