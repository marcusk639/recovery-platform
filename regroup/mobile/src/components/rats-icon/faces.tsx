import React from 'react';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import { color } from '../../styles/theme';
import HealthConstants from '../../constants/health';

interface Props {
  size?: any;
  health?: 'happy' | 'neutral' | 'sad';
  style?: any;
  name?: string;
  solid?: boolean;
  key?: string;
}

const MehFace = (props: Props) => {
  const { health, size, style } = props;
  return (
    <FontAwesome5
      style={[
        {
          color:
            health === HealthConstants.NEUTRAL ? color.yellow : color.black,
        },
        style,
      ]}
      name="meh"
      size={size}
    />
  );
};

const SadFace = (props: Props) => {
  const { health, size, style } = props;
  return (
    <FontAwesome5
      style={[
        { color: health === HealthConstants.SAD ? color.red : color.black },
        style,
      ]}
      name="frown-open"
      size={size}
    />
  );
};

const HappyFace = (props: Props) => {
  const { health, size, style } = props;
  return (
    <FontAwesome5
      style={[
        { color: health === HealthConstants.HAPPY ? color.green : color.black },
        style,
      ]}
      name="laugh"
      size={size}
    />
  );
};

const SuperHappyFace = (props: Props) => {
  const { health, size, style } = props;
  return (
    <FontAwesome5
      style={[
        {
          color:
            health === HealthConstants.SUPER_HAPPY
              ? color.baby_blue
              : color.black,
        },
        style,
      ]}
      name="laugh-beam"
      size={size}
    />
  );
};

const Icon = (props: Props) => {
  const { health, size, style, name } = props;
  return <FontAwesome5 {...props} style={style} name={name || ''} size={size} />;
};

const getHealthIcon = (health: 'happy' | 'neutral' | 'sad', props: Props) => {
  switch (health) {
    case 'happy':
      return <HappyFace {...props} health={health} />;
    case 'neutral':
      return <MehFace {...props} health={health} />;
    case 'sad':
      return <SadFace {...props} health={health} />;
    default:
      return <SuperHappyFace {...props} health={health} />;
  }
};

export { MehFace, SadFace, HappyFace, Icon, getHealthIcon };
