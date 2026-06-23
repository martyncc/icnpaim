import React, { useState, useEffect } from 'react'
import Modal from '@material-ui/core/Modal'
import ContentForm from './form'
import * as styles from './contents.module.css'
import ContentsList from './list'
import API from '../../../../services/contents'
import AddIcon from '@material-ui/icons/Add'
import CloseIcon from '@material-ui/icons/Close'
import TooltipIconButton from '../../../organisms/TooltipIconButton'
import Typography from '@material-ui/core/Typography'

export default function ContentsAdmin ({ unitId = null }) {
    const [ isModalOpen, setModalOpen ] = useState(false)
    const [ contents, setContents ]= useState([])
    const [ editedContent, setEditedContent ] = useState({})

    useEffect( () => {
        if (unitId) loadContents()
    }, [ unitId ])
    
    const loadContents = async () => {
        const data = await API.getAll(unitId)
        setContents(data)
    }

    const handleContentUpdate = (action, updatedContent) => {
        console.log('handleContentUpdate', {action,updatedContent})
        if (action == 'added') {
            console.log('added')
            setContents([ ...contents, updatedContent ])
        } if (action == 'updated') {
            console.log('updated')
            setContents(contents.map((u) => (u.id === updatedContent.id ? updatedContent : u)))
        } if (action == 'removed') {
            console.log('updated')
            setContents(contents.filter((u) => u.id !== updatedContent.id))
        }
        setEditedContent({})
        setModalOpen(false)
    }

    const handleContentClick = (targetContent) => {
        setEditedContent(targetContent)
        setModalOpen(true)
    }

    return (
        <div>
            <div className={styles.titleWrapper} >
                <div className={styles.title}>
                    <Typography variant='h2'>
                        Contenidos
                    </Typography>
                </div>
                <TooltipIconButton
                    title='Agregar Nuevo Contenido'
                    onClick={() => setModalOpen(true)}
                >
                    <AddIcon 
                        style={{
                            color: 'white',
                            backgroundColor: 'green'
                        }}
                    />
                </TooltipIconButton>
            </div>

            <ContentsList
                contents={contents}
                onContentClick={handleContentClick}
            />

            <Modal
                open={isModalOpen}
                className={styles.modal}
                onClose={() => setModalOpen(false)}
                aria-labelledby='simple-modal-title'
                aria-describedby='simple-modal-description'
            >
                <div className={styles.modalContent}>
                    <div className={styles.modalTitle}>
                        <div>Contenido</div>
                        <TooltipIconButton
                            title='Cerrar'
                            onClick={() => setModalOpen(false)}
                        >
                            <CloseIcon />
                        </TooltipIconButton>
                    </div>
                    <ContentForm
                        unitId={unitId}
                        content={editedContent}
                        updateCallback={handleContentUpdate}
                    />
                </div>
            </Modal>
        </div>
    )
}