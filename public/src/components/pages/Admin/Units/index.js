import React, { useState, useEffect } from 'react'
import ContentsAdmin from '../Contents'
import { v4 as uuidv4 } from 'uuid'
import Accordion from '@material-ui/core/Accordion'
import AccordionDetails from '@material-ui/core/AccordionDetails'
import AccordionSummary from '@material-ui/core/AccordionSummary'
import Unitform from './unitForm'
import Modal from '@material-ui/core/Modal'
import VerticalTabs from '../../../organisms/VerticalTabs'

/*
import Tabs from '@material-ui/core/Tabs'
import Tab from '@material-ui/core/Tab'
import AppBar from '@material-ui/core/AppBar'
*/

import API from '../../../../services/units'
import * as styles from './units.module.css'

export default function UnitsAdmin() {
    const [ isModalOpen, setModalOpen ] = useState(false)
    const [ units, setUnits ] = useState([])
    const [ selectedUnitId, setSelectedUnitId ] = useState(null)
    const [ loading, setLoading ] = useState(false)

    useEffect(() => {
        loadUnits()
    }, [])

    const loadUnits = async () => {
        setLoading(true)
        try {
            const data = await API.getAll()
            setUnits(data)
        } catch (err) {
            console.error('Fail to load units', err)
        } finally {
            setLoading(false)
        }
    }


    const handleAccordionChange = (panel) => (e, isExpanded) => {
        setSelectedUnitId(isExpanded ? panel : false )
    }

    const handleUnitsUpdate = (action, updatedUnit) => {
        console.log('handleUnitsUpdate', {action,updatedUnit})
        if (action == 'added') {
            console.log('added')
            setUnits([ ...units, updatedUnit ])
        } if (action == 'updated') {
            console.log('updated')
            setUnits(units.map((u) => (u.id === selectedUnitId ? updatedUnit : u)))
        } if (action == 'removed') {
            console.log('removed')
            setUnits(units.filter((u) => u.id !== updatedUnit.id))
        }
    }

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
            <div className={styles.header}>
                <h2>Unidades</h2>
                <button
                    onClick={() => setModalOpen(true)}
                    style={{
                        padding: '8px 16px',
                        background: '#2ecc71',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Agregar Unidad
                </button>
            </div>


            {loading ? (
                <p>Loading units...</p>
            ) : (<div>
                {
                    units.map((unit) => (
                        <Accordion
                            key={uuidv4()}
                            expanded={selectedUnitId === unit.id}
                            onChange={handleAccordionChange(unit.id)}
                        >
                            <AccordionSummary className={styles.accordion}>
                                <div 
                                    className={styles.colorIndicator}
                                    style={{
                                        backgroundColor: unit.color
                                    }}
                                ></div>
                                {unit.name}
                            </AccordionSummary>
                            <AccordionDetails>
                                <VerticalTabs color={unit.color}>
                                    <div data-title='Datos'
                                        className={styles.tabWrapper}
                                    >
                                        <Unitform
                                            unit={unit}
                                            updateCallback={handleUnitsUpdate}
                                        />
                                    </div>
                                    <div data-title='Contenidos'
                                        className={styles.tabWrapper}
                                    >
                                        <ContentsAdmin unitId={selectedUnitId}/>
                                    </div>
                                    <div data-title='Rutas Aprendizaje'
                                        className={styles.tabWrapper}
                                    >
                                        Rutas
                                    </div>
                                </VerticalTabs>
                            </AccordionDetails>
                        </Accordion> 
                    ))
                }
            </div>
            )}
            <Modal
                open={isModalOpen}
                className={styles.modal}
                onClose={() => setModalOpen(false)}
                aria-labelledby='simple-modal-title'
                aria-describedby='simple-modal-description'
            >
                <div className={styles.modalContent}>
                    <div className={styles.modalTitle}>
                        <div>Nueva Unidad</div>
                        <button onClose={() => setModalOpen(false)}> X </button>
                    </div>
                    <Unitform
                        unit={{}}
                        updateCallback={handleUnitsUpdate}
                    />
                </div>
            </Modal>
        </div>
    )
}




{/*
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ddd', background: '#eaedd1' }}>
                            <th style={{ padding: '10px' }}>ID</th>
                            <th style={{ padding: '10px' }}>Nombre</th>
                            <th style={{ padding: '10px' }}>Color</th>
                            <th style={{ padding: '10px' }}>Posición</th>
                            <th style={{ padding: '10px', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {units.length === 0 ? (
                            <tr>
                                <td colSpan='5' style={{ padding: '20px', textAlign: 'center', color: '#777' }}>No se encontraron unidades. Agrega una!</td>
                            </tr>
                        ) : (
                            units.map((unit) => (
                                <tr key={unit.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '10px' }}>{unit.id}</td>
                                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{unit.name}</td>
                                    <td style={{ padding: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ display: 'inline-block', width: '20px', height: '20px', borderRadius: '4px', backgroundColor: unit.color || '#cccccc', border: '1px solid #aaa' }}></span>
                                            <code style={{ fontSize: '12px' }}>{unit.color || 'none'}</code>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px' }}>{unit.position}</td>
                                    <td style={{ padding: '10px', textAlign: 'right' }}>
                                        <button onClick={() => startEdit(unit)} style={{ marginRight: '6px', padding: '4px 8px', background: '#3498db', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                                        Modificar
                                        </button>
                                        <button onClick={() => handleDelete(unit.id)} style={{ padding: '4px 8px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                                        Eliminar
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
*/}