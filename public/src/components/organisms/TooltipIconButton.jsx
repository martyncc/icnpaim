import React from 'react'
import { IconButton } from '@material-ui/core'
import Tooltip from '@material-ui/core/Tooltip'

const  TooltipIconButton = (props) => {
    return (
        <Tooltip
            title={props.title}
            placement='bottom'
            arrow
        >
            <IconButton
                onClick={props.onClick}
            >
                {props.children}
            </IconButton>
        </Tooltip>
    )
}

export default TooltipIconButton