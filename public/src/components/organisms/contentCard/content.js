import React from 'react'
import Typography from '@material-ui/core/Typography'

export const CardContent = (props) => {
    const { 
        card = {},
        color = ''
    } = props
    
    return <>
        <Typography
            style={{
                flexGrow: 1,
                fontSize: '1rem',
                lineHeight: '1.75rem',
                fontWeight: 700
            }}
        >
            {card.title}
        </Typography>

        <Typography
            style={{
                color,
                fontSize: '0.875rem',
                lineHeight: '1.25rem',
                fontWeight: 500
            }}
        >
            {card.description}
        </Typography>
    </>
}