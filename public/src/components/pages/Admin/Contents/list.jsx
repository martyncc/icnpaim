import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
//import Accordion from '@material-ui/core/Accordion'
//import AccordionDetails from '@material-ui/core/AccordionDetails'
//import AccordionSummary from '@material-ui/core/AccordionSummary'
import * as styles from './contents.module.css'

export default function ContentsList ({
    contents,
    onContentClick,
}) {
    //const [ selectedContentId, setSelectedContentId ] = useState(null)

    /*
    const handleAccordionChange = (panel) => (e, isExpanded) => {
        setSelectedContentId(isExpanded ? panel : false )
    }
        */

    return (
        <div className={styles.contentList}>
            {
                contents.map((c) => (
                    <div
                        key={uuidv4()}
                        className={styles.contentListItem}
                        onClick={() => onContentClick(c)}
                    >
                        <div className={styles.contentListTitle}>{c.title}</div>
                        <div className={styles.contentListChip}>{c.type}</div>
                        <div className={styles.contentListURL}>{c.url}</div>
                    </div>
                ))
            }
        </div>
    )
}

/*

                    <Accordion
                        key={uuidv4()}
                        expanded={selectedContentId === c.id}
                        onChange={handleAccordionChange(c.id)}
                    >
                        <AccordionSummary onClick={ () => onContentClick(c) }>
                            <div>{c.title}</div>
                        </AccordionSummary>
                        <AccordionDetails>
                            <div>
                                <div>{c.description}</div>
                                <div>{c.type}</div>
                                <div>{c.url}</div>
                            </div>
                        </AccordionDetails>
                    </Accordion>
*/