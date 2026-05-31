import React from 'react';
import Popover from 'react-native-popover-view';
import { PublicPopoverProps } from 'react-native-popover-view/dist/Popover';

export function RatsPopover(props: PublicPopoverProps & { children: any }) {
  return <Popover {...props}>{props.children}</Popover>;
}
