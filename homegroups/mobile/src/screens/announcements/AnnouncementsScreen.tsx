import React, {useState, useEffect} from 'react';
import {SafeAreaView, StyleSheet, Alert} from 'react-native';
import AnnouncementList from '../../components/announcement/AnnouncementList';
import AnnouncementDetail from '../../components/announcement/AnnouncementDetail';
import auth from '@react-native-firebase/auth';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';

// Types
export interface Announcement {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  authorName: string;
  expiresAt?: Date;
  readCount?: number;
  readBy?: string[];
}

type RootStackParamList = {
  HomeGroup: {groupId: string};
  Announcements: {groupId: string; groupName: string};
};

type AnnouncementsScreenRouteProp = RouteProp<
  RootStackParamList,
  'Announcements'
>;
type AnnouncementsScreenNavigationProp =
  NativeStackNavigationProp<RootStackParamList>;

const AnnouncementsScreen: React.FC = () => {
  const route = useRoute<AnnouncementsScreenRouteProp>();
  const navigation = useNavigation<AnnouncementsScreenNavigationProp>();
  const {groupId, groupName} = route.params;

  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    // Set the screen title
    navigation.setOptions({
      title: `${groupName} Announcements`,
    });

    // Get current user ID
    const user = auth().currentUser;
    if (user) {
      setCurrentUserId(user.uid);
    }

    // Check if user is an admin of this group
    const checkAdminStatus = async () => {
      try {
        // In a real app, this would check Firestore
        // For now, simulate with mock data
        setIsAdmin(true); // For testing purposes
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    checkAdminStatus();
  }, [groupId, groupName, navigation]);

  const handleAnnouncementPress = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
  };

  const handleAnnouncementUpdate = (updatedAnnouncement: Announcement) => {
    // In a real app, this would update Firestore
    // For now, just show a success message
    Alert.alert('Success', 'Announcement updated successfully!');
    setSelectedAnnouncement(null);
  };

  const handleAnnouncementDelete = (announcementId: string) => {
    // In a real app, this would delete from Firestore
    // For now, just show a success message
    Alert.alert('Success', 'Announcement deleted successfully!');
  };

  // Sort announcements to show pinned ones first
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <SafeAreaView style={styles.container}>
      <AnnouncementList
        groupId={groupId}
        isAdmin={isAdmin}
        onAnnouncementPress={handleAnnouncementPress}
        announcements={sortedAnnouncements}
        setAnnouncements={setAnnouncements}
      />
      {selectedAnnouncement && (
        <AnnouncementDetail
          announcement={selectedAnnouncement}
          isAdmin={isAdmin}
          isCreator={selectedAnnouncement.createdBy === currentUserId}
          onDismiss={() => setSelectedAnnouncement(null)}
          onUpdate={handleAnnouncementUpdate}
          onDelete={handleAnnouncementDelete}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
});

export default AnnouncementsScreen;
