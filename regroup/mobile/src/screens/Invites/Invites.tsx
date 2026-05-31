// import React, { Component } from 'react';
// import { connect } from 'react-redux';
// import { House } from '../../entities/House';
// import { Email, InviteEmailPayload } from '../../entities/Email';
// import { createNewInviteLink } from '../../services/dynamic-links';
// import { User } from '../../entities/User';
// import { View, Alert } from 'react-native';
// import * as _ from 'lodash';
// import * as houseActions from '../../store/actions/house';
// import { RatsText } from '../../components';
// import { sendInvites } from '../../services/invites';
// import RatsScrollView from '../../components/RatsScrollView/RatsScrollView';
// import styles from '../HouseConfig/HouseConfigStyles';
// import RatsTextInput from '../../componentsInputInput';
// import uuid from 'uuid/v4';
// import RatsButton from '../../components/RatsButton/RatsButton';
// import { getInitialPhase } from '../../util/house';
// import { house } from './house';

// interface Props {
//   house: House;
//   user: User;
//   selectHouse: Function;
// }

// class State {
//   invites: { [key: string]: Partial<Email> } = { invite_0: {} };
// }

// const houseId = 'oReUMPURqJqBAn3sNOjP';

// class InvitesScreen extends Component<Props, State> {
//   constructor(props: Props) {
//     super(props);
//     this.state = new State();
//   }

//   componentDidMount() {
//     const { selectHouse } = this.props;
//     selectHouse(house);
//   }

//   getDynamicLink = async (email: string) => {
//     const initialPhase = getInitialPhase(this.props.house).name;
//     return createNewInviteLink(houseId, this.props.user.uid, email, 'admin', initialPhase);
//   };

//   sendInvites = async () => {
//     const emailInvitePromises: Promise<InviteEmailPayload[]> = Promise.all(
//       _.map(this.state.invites, async invite => ({ email: invite, dynamicLink: await this.getDynamicLink(invite.to) }))
//     );
//     try {
//       const emailInvitePayloads = await emailInvitePromises;
//       return sendInvites(emailInvitePayloads);
//     } catch (error) {
//       Alert.alert('There was an error sending the invites. Please try again later.');
//     }
//   };

//   addInvite = () => {
//     const id = uuid.v4();
//     this.setState(prevState => ({ invites: { ...prevState.invites, [id]: {} } }));
//   };

//   renderInvites = () => {
//     return _.map(this.state.invites, (invite, key) => {
//       const setInviteEmailAddress = text => this.setState(prevState => ({ invites: { ...prevState.invites, [key]: { to: text } } }));
//       return (
//         <RatsTextInput label="Invite" field={{ name: key, value: invite.to }} customHandleChange={setInviteEmailAddress} styleType="secondary" />
//       );
//     });
//   };

//   render() {
//     return (
//       <RatsScrollView keyboardShouldPersistTaps="always" resetScrollToCoords={{ x: 0, y: 0 }} scrollEnabled contentContainerStyle={styles.container}>
//         <View style={styles.innerContainer}>
//           <View style={styles.headerContainer}>
//             <RatsText style={styles.header} translate={false} text="Send Invites" />
//             {this.renderInvites()}
//             <RatsButton containerStyle={styles.createAccountButton} title="Add" onPress={this.addInvite} />
//             <RatsButton containerStyle={styles.createAccountButton} title="Send" onPress={this.sendInvites} />
//           </View>
//         </View>
//       </RatsScrollView>
//     );
//   }
// }

// function mapStateToProps(state) {
//   return {
//     house: state.houses.selectedHouse,
//     user: state.user.user
//   };
// }

// export default connect(
//   mapStateToProps,
//   { ...houseActions }
// )(InvitesScreen);
