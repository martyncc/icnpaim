import React, { useState } from 'react'
import API from '../../../../services/contents'
import TooltipIconButton from '../../../organisms/TooltipIconButton'
import CloseIcon from '@material-ui/icons/Close'
import SaveIcon from '@material-ui/icons/Save'
import DeleteIcon from '@material-ui/icons/Delete'
import * as styles from '../form.module.css'

const _EMPTY_CONTENT = { title: '', type: '', url: '' }

export default function ContentsForm ({
    unitId,
    content = {},
    updateCallback = () => {}
}) {
    const [ formData, setFormData ] = useState(
        content.id ? content : _EMPTY_CONTENT
    )

    const handleSubmit = async (e) => {
        e.preventDefault()
        const updatedContent = await API.updateContent({...formData, unitId})
        const action = formData.id ? 'updated' : 'added'
        updateCallback(action, updatedContent)
        return updatedContent
    }

    const handleInputChange = (e) => {
        const { name, value } = e.target
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }))
    }

    const cancelEdit = () => {
        updateCallback('cenceled', {})
    }

    const handleRemove = async () => {
        const ok = confirm(`¿Estas seguro de eliminar el contenido ${content.title}?`)
        if (!ok) return

        console.log('handleRemove')
        await API.delete(unitId, content.id)
        console.log('removed')
        updateCallback('removed', content)
    }

    return (
        <form
            className={styles.form}
        >
            <input
                name='id'
                type='hidden'
                value={content.id ?? ''}
            />

            <div className={styles.inputWrapper}>
                <label className={styles.label}> Título </label>
                <input
                    type='text'
                    name='title'
                    className={styles.input}
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder='Título'
                    required
                />
            </div>

            <div className={styles.inputWrapper}>
                <label className={styles.label}> Tipo </label>
                <input
                    type='text'
                    name='type'
                    className={styles.input}
                    value={formData.type}
                    onChange={handleInputChange}
                    placeholder='Tipo'
                    required
                />
            </div>

            <div className={styles.inputWrapper}>
                <label className={styles.label}>URL</label>
                <input
                    type='text'
                    name='url'
                    className={styles.input}
                    value={formData.url}
                    onChange={handleInputChange}
                    required
                />
            </div>

            <div className={styles.modalButtons}>

                <TooltipIconButton
                    title={content.id ? 'Guardar Contenido' : 'Agregar Contenido'}
                    onClick={handleSubmit}
                >
                    <SaveIcon />
                </TooltipIconButton>
                {/*}
                <button
                    type='submit'
                    className={styles.submitButton}
                    style={{
                        background: content.id ? '#e67e22' : '#2ecc71'
                    }}>
                    {content.id ? 'Actualizar Unidad' : 'Agregar Unidad'}
                </button>
                */}
                <TooltipIconButton
                    title='Cancelar'
                    onClick={cancelEdit}
                >
                    <CloseIcon />
                </TooltipIconButton>

                {
                    content.id ? (
                        <TooltipIconButton
                            title='Eliminar'
                            onClick={handleRemove}
                        >
                            <DeleteIcon />
                        </TooltipIconButton>
                    ) : null
                }
            </div>

        </form>
    )
}

