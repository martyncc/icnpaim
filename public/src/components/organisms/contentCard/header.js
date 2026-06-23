import React from 'react'
import Typography from '@material-ui/core/Typography';
import {
    RadioButtonChecked as Checked,
    RadioButtonUnchecked as Unchecked
} from '@material-ui/icons'
import { Icon } from './Icon'
import { _OK_GREEN, _INACTIVE_GRAY } from './colors'
import { v4 as uuidv4 } from 'uuid';

export function CardHeader(props) {
    const { card, color } = props
    const circleStyles = {
        width: 20,
        height: 20,
        borderRadius: 10,
        color: card.completed ? _OK_GREEN : _INACTIVE_GRAY
    }

    return <div style={{
        display: 'flex',
        justifyContent: 'space-between'
    }}
    >
        <div 
            key={uuidv4()}
            style={{
                backgroundColor: color,
                display: 'flex',
                paddingLeft: '0.75rem',
                paddingRight: '0.75rem',
                paddingBottom: '0.25rem',
                paddingTop: '0.25rem',
                gridTemplateColumns: '1fr 2fr',
                borderRadius: '100px',
                placeItems: 'center',
                height: '30px',
                width: 'fit-content'
            }}
        >
            <Icon 
                search={card.tipoActividad}
                color={'white'}
            />
            <Typography
                variant="body2"
                style={{
                    flexGrow: 1,
                    fontSize: 12,
                    color: 'white'
                }}
            >
                {card.tipoActividad || 'actividad'}
            </Typography>
        </div>

        <div
            key={uuidv4()}
            styles={{
                display: 'flex',
                justifyContent: 'end'
            }}    
        >

        </div>
        {
            card.completed
                ? <Checked style={circleStyles}/>
                : <Unchecked style={circleStyles}/>
        }
    </div>
}

