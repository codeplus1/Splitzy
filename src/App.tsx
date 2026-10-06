import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  Group,
  Expense,
  ExpenseShare,
  SettlementRecord,
  Member,
  GroupMember,
} from './types';
import {
  loadAppState,
  saveAppState,
  exportStateAsJSON,
  importStateFromJSON,
  reconcileAppState,
  AppState,
} from './services/storage';
import {
  SyncStatus,
  initAuthSession,
  subscribeToUserCloudSync,
  cloudCreateGroup,
  cloudUpdateGroup,
  cloudDeleteGroup,
  cloudAddMember,
  cloudSaveExpense,
  cloudDeleteExpense,
  cloudSaveSettlement,
  cloudUploadFullState,
  joinGroupByInviteCode,
  generateInviteCode,
  generateGuaranteedUniqueInviteCode,
  cloudRegisterOrUpdateUserProfile,
  generateDefaultUsername,
  normalizeUsername,
  AppUser,
  getOrCreateLocalUser,
} from './services/firebase';
import {
  calculateMemberBalances,
  optimizeSettlements,
} from './core/calculation';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { GroupDetail } from './components/GroupDetail';
import { UserOnboardingModal } from './components/UserOnboardingModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  AppLockScreen,
  isAppLockEnabled,
  getAppLockTimeoutMs,
} from './components/AppLockScreen';

const AddExpenseModal = lazy(() =>
  import('./components/AddExpenseModal').then(m => ({ default: m.AddExpenseModal }))
);
const CreateGroupModal = lazy(() =>
  import('./components/CreateGroupModal').then(m => ({ default: m.CreateGroupModal }))
);
const JoinGroupModal = lazy(() =>
  import('./components/JoinGroupModal').then(m => ({ default: m.JoinGroupModal }))
);
const SettleModal = lazy(() =>
  import('./components/SettleModal').then(m => ({ default: m.SettleModal }))
);
const TestRunnerModal = lazy(() =>
  import('./components/TestRunnerModal').then(m => ({ default: m.TestRunnerModal }))
);
const SecurityCenterModal = lazy(() =>
  import('./components/SecurityCenterModal').then(m => ({ default: m.SecurityCenterModal }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then(m => ({ default: m.SettingsModal }))
);

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [currentUser, setCurrentUser] = useState<AppUser>(() => getOrCreateLocalUser());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    () => appState.activeGroupId || appState.groups[0]?.id || null
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');

  // Modals state
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<{
    expense: Expense;
    shares: ExpenseShare[];
  } | null>(null);

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isJoinGroupOpen, setIsJoinGroupOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleParams, setSettleParams] = useState<{
    fromId?: string;
    toId?: string;
    amount?: number;
  }>({});
  const [isTestRunnerOpen, setIsTestRunnerOpen] = useState(false);
  const [isSecurityCenterOpen, setIsSecurityCenterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(() => {
    const hasUser = Boolean(appState.userProfile || appState.members.length > 0);
    return hasUser && isAppLockEnabled();
  });
  const [appLockConfigVersion, setAppLockConfigVersion] = useState(0);

  // Listen for PIN / Auto-lock preference changes from Settings
  useEffect(() => {
    const handleConfigChange = () => {
      setAppLockConfigVersion(v => v + 1);
    };
    window.addEventListener('splitzy-autolock-config-changed', handleConfigChange);
    return () =>
      window.removeEventListener('splitzy-autolock-config-changed', handleConfigChange);
  }, []);

  // Automatic inactivity and background auto-lock timer (defaults to 1 minute or user-selected preference)
  useEffect(() => {
    if (isAppLocked || !isAppLockEnabled()) return;
    const timeoutMs = getAppLockTimeoutMs();
    if (timeoutMs <= 0) return;

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastActivityAt = Date.now();

    const resetIdleTimer = () => {
      lastActivityAt = Date.now();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (isAppLockEnabled()) {
          setIsAppLocked(true);
        }
      }, timeoutMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastActivityAt >= timeoutMs && isAppLockEnabled()) {
          setIsAppLocked(true);
        } else {
          resetIdleTimer();
        }
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'wheel',
      'scroll',
    ];

    activityEvents.forEach(ev =>
      window.addEventListener(ev, resetIdleTimer, { passive: true })
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);
    resetIdleTimer();

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      activityEvents.forEach(ev => window.removeEventListener(ev, resetIdleTimer));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAppLocked, appLockConfigVersion]);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Show Toast helper
  const showToast = (
    message: string,
    type: 'success' | 'error' | 'info' = 'info'
  ) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 1. Initialize user session (anonymous auth for friction-free private usage)
  useEffect(() => {
    const unsubAuth = initAuthSession(user => {
      setCurrentUser(user);
    });
    return () => unsubAuth();
  }, []);

  // Ensure the current user's profile has a unique @username registered in Firestore userDirectory
  useEffect(() => {
    if (!currentUser?.uid) return;
    const myProfile =
      appState.userProfile ||
      appState.members.find(m => m.id === appState.currentUserId);
    if (!myProfile) return;

    const assignedUsername =
      myProfile.username || generateDefaultUsername(myProfile.name, currentUser.uid);

    if (!myProfile.username || myProfile.uid !== currentUser.uid) {
      const enriched: Member = {
        ...myProfile,
        username: assignedUsername,
        uid: currentUser.uid,
      };
      setAppState(prev => ({
        ...prev,
        userProfile: enriched,
        members: prev.members.map(m => (m.id === enriched.id ? enriched : m)),
      }));
      cloudRegisterOrUpdateUserProfile(enriched);
    } else {
      cloudRegisterOrUpdateUserProfile(myProfile);
    }
  }, [currentUser?.uid, appState.userProfile?.id, appState.currentUserId]);

  // 2. Real-time synchronization strictly SCOPED to the authenticated user's groups
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToUserCloudSync(
      currentUser.uid,
      cloudData => {
        // Automatically purge stale pre-reset group (#KJCAN4 / "September खर्च") if it resurfaced from local cache
        const staleGroups = cloudData.groups.filter(
          g => g.inviteCode === 'KJCAN4' || g.name?.includes('September खर्च')
        );
        if (staleGroups.length > 0) {
          for (const sg of staleGroups) {
            const sgExpenses = cloudData.expenses.filter(e => e.groupId === sg.id);
            const sgExpIds = new Set(sgExpenses.map(e => e.id));
            const sgShares = cloudData.expenseShares.filter(s => sgExpIds.has(s.expenseId));
            const sgSettlements = cloudData.settlements.filter(s => s.groupId === sg.id);
            const sgGroupMembers = cloudData.groupMembers.filter(gm => gm.groupId === sg.id);
            cloudDeleteGroup(sg.id, sgExpenses, sgShares, sgSettlements, sgGroupMembers, sg.inviteCode);
          }
        }

        // Safe reconciliation merge algorithm: never overwrite local data with partial results
        setAppState(prev => reconcileAppState(prev, cloudData));

        const isRealFirebaseUid = Boolean(
          currentUser.uid &&
            currentUser.uid !== 'anonymous' &&
            !currentUser.uid.startsWith('u_')
        );

        if (cloudData.isInitialLoad && isRealFirebaseUid) {
          const local = loadAppState();
          const pendingGroupSet = new Set(local.pendingGroupIds || []);
          const pendingLocalGroups = local.groups.filter(g => pendingGroupSet.has(g.id));
          if (pendingLocalGroups.length > 0) {
            const preparedGroups = pendingLocalGroups.map(g => {
              const isLocalCreator =
                !g.createdBy ||
                g.createdBy === 'anonymous' ||
                g.createdBy.startsWith('u_');
              return {
                ...g,
                createdBy: isLocalCreator ? currentUser.uid : g.createdBy,
                memberUserIds: Array.from(
                  new Set([
                    ...(g.memberUserIds || []).filter(
                      u => u !== 'anonymous' && !u.startsWith('u_')
                    ),
                    currentUser.uid,
                  ])
                ),
                inviteCode: g.inviteCode || generateInviteCode(),
              };
            });
            cloudUploadFullState({ ...local, groups: preparedGroups }, currentUser);
          }
        }
      },
      status => {
        setSyncStatus(status);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser]);

  // 3. Handle incoming join link (?join=CODE) and client-side group route (/group/:id or ?group=id)
  const pendingJoinCodeRef = useRef<string | null>(null);
  const pendingRouteGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    const routeGroupId = params.get('group');
    const pathMatch = window.location.pathname.match(/^\/group\/([^/]+)/);
    const initialGroupFromUrl = routeGroupId || (pathMatch ? decodeURIComponent(pathMatch[1]) : null);

    if (initialGroupFromUrl) {
      if (appState.groups.some(g => g.id === initialGroupFromUrl)) {
        setActiveGroupId(initialGroupFromUrl);
        pendingRouteGroupIdRef.current = null;
      } else {
        pendingRouteGroupIdRef.current = initialGroupFromUrl;
      }
    }

    if (joinCode) {
      pendingJoinCodeRef.current = joinCode;
      window.history.replaceState({}, document.title, '/');
    }

    if (pendingJoinCodeRef.current && currentUser) {
      const codeToJoin = pendingJoinCodeRef.current;
      pendingJoinCodeRef.current = null;
      handleJoinGroup(codeToJoin).catch(() => {});
    }
  }, [currentUser]);

  // Resolve pending deep-linked group once cloud sync populates appState.groups
  useEffect(() => {
    const pendingId = pendingRouteGroupIdRef.current;
    if (pendingId && appState.groups.some(g => g.id === pendingId)) {
      pendingRouteGroupIdRef.current = null;
      setActiveGroupId(pendingId);
    }
  }, [appState.groups]);

  // Keep browser URL in sync with activeGroupId and support browser Back/Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const pathMatch = window.location.pathname.match(/^\/group\/([^/]+)/);
      if (pathMatch) {
        const gid = decodeURIComponent(pathMatch[1]);
        setActiveGroupId(gid);
      } else {
        pendingRouteGroupIdRef.current = null;
        setActiveGroupId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!activeGroupId && pendingRouteGroupIdRef.current) {
      // Wait for cloud sync before overwriting a deep-linked /group/:id URL
      return;
    }
    const targetPath = activeGroupId ? `/group/${encodeURIComponent(activeGroupId)}` : '/';
    if (window.location.pathname !== targetPath && !window.location.search.includes('join=')) {
      window.history.pushState({ activeGroupId }, document.title, targetPath);
    }
  }, [activeGroupId]);

  // Automatically flush any pending offline changes when network connection is restored
  useEffect(() => {
    const handleOnlineRecovery = () => {
      if (currentUser && (appState.groups.length > 0 || (appState.pendingExpenseIds?.length || 0) > 0)) {
        setSyncStatus('syncing');
        cloudUploadFullState(appState, currentUser).then(res => {
          if (res.success) {
            setSyncStatus('connected');
            setAppState(prev => ({ ...prev, pendingExpenseIds: [] }));
          }
        });
      }
    };
    const handleOfflineState = () => {
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnlineRecovery);
    window.addEventListener('offline', handleOfflineState);
    return () => {
      window.removeEventListener('online', handleOnlineRecovery);
      window.removeEventListener('offline', handleOfflineState);
    };
  }, [currentUser, appState]);

  // Sync state changes to localStorage as offline safety
  useEffect(() => {
    saveAppState({ ...appState, activeGroupId });
  }, [appState, activeGroupId]);

  // Handle Theme switching (light, dark, system)
  useEffect(() => {
    const root = document.documentElement;
    const isDark =
      appState.theme === 'dark' ||
      (appState.theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    if (appState.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [appState.theme]);

  // Current Active Group
  const currentGroup = appState.groups.find(g => g.id === activeGroupId) || null;

  // Add / Edit Expense handler - Automatically synchronized with Cloud Database
  const handleSaveExpense = (newExpense: Expense, rawShares: ExpenseShare[]) => {
    const newShares = rawShares.map(s => ({
      ...s,
      groupId: s.groupId || newExpense.groupId,
    }));
    const isExisting = appState.expenses.some(e => e.id === newExpense.id);
    const oldShareIds = isExisting
      ? appState.expenseShares.filter(s => s.expenseId === newExpense.id).map(s => s.id)
      : [];

    let updatedExpensesState: Expense[] = [];
    let updatedSharesState: ExpenseShare[] = [];

    setAppState(prev => {
      let updatedExpenses = prev.expenses;
      let updatedShares = prev.expenseShares;

      if (isExisting) {
        updatedExpenses = prev.expenses.map(e =>
          e.id === newExpense.id ? newExpense : e
        );
        updatedShares = prev.expenseShares
          .filter(s => s.expenseId !== newExpense.id)
          .concat(newShares);
      } else {
        updatedExpenses = [newExpense, ...prev.expenses];
        updatedShares = [...prev.expenseShares, ...newShares];
      }

      updatedExpensesState = updatedExpenses;
      updatedSharesState = updatedShares;

      // Tombstone cleanup and pending sync tracking
      const updatedDeleted = (prev.deletedExpenseIds || []).filter(id => id !== newExpense.id);
      const updatedPending = Array.from(new Set([...(prev.pendingExpenseIds || []), newExpense.id]));

      return {
        ...prev,
        expenses: updatedExpenses,
        expenseShares: updatedShares,
        deletedExpenseIds: updatedDeleted,
        pendingExpenseIds: updatedPending,
      };
    });

    // Automatically sync to Firebase Firestore Cloud Database
    setSyncStatus('saving');
    const targetGroup =
      appState.groups.find(g => g.id === newExpense.groupId) || currentGroup;
    cloudSaveExpense(newExpense, newShares, oldShareIds, targetGroup).then(async res => {
      if (res.success) {
        setSyncStatus('connected');
        setAppState(prev => ({
          ...prev,
          pendingExpenseIds: (prev.pendingExpenseIds || []).filter(id => id !== newExpense.id),
        }));
        showToast(
          isExisting
            ? 'Expense updated & synced to cloud!'
            : 'Expense added & automatically synced to cloud!',
          'success'
        );
      } else {
        console.warn('Expense auto-sync note:', res.error);
        // If parent group/members need reconciliation, auto-upload full state
        try {
          const syncRes = await cloudUploadFullState({
            ...appState,
            expenses: updatedExpensesState.length > 0 ? updatedExpensesState : appState.expenses,
            expenseShares: updatedSharesState.length > 0 ? updatedSharesState : appState.expenseShares,
          }, currentUser);
          if (syncRes.success) {
            setSyncStatus('connected');
            setAppState(prev => ({
              ...prev,
              pendingExpenseIds: (prev.pendingExpenseIds || []).filter(id => id !== newExpense.id),
            }));
            showToast('Expense and database auto-synced to cloud!', 'success');
            return;
          }
        } catch (healErr) {
          console.error('Auto-heal error:', healErr);
        }
        setSyncStatus('error');
        showToast('Saved locally. Auto-sync will retry automatically.', 'info');
      }
    });

    setExpenseToEdit(null);
  };

  // Delete Expense handler
  const handleDeleteExpense = (expenseId: string) => {
    const associatedShares = appState.expenseShares.filter(
      s => s.expenseId === expenseId
    );

    setAppState(prev => ({
      ...prev,
      expenses: prev.expenses.filter(e => e.id !== expenseId),
      expenseShares: prev.expenseShares.filter(s => s.expenseId !== expenseId),
      deletedExpenseIds: Array.from(new Set([...(prev.deletedExpenseIds || []), expenseId])),
      pendingExpenseIds: (prev.pendingExpenseIds || []).filter(id => id !== expenseId),
    }));

    // Sync deletion to Cloud Firestore
    cloudDeleteExpense(expenseId, associatedShares);
    showToast('Expense deleted', 'info');
  };

  // Save / Update Primary User Profile (First-time onboarding or profile edit)
  const handleSaveUserProfile = async (
    name: string,
    username: string,
    avatar: string,
    color: string
  ): Promise<{ success: boolean; error?: string }> => {
    const existingMember =
      appState.members.find(m => m.id === appState.currentUserId) ||
      appState.userProfile;

    const memberId = existingMember?.id || `m_owner_${Date.now()}`;
    const cleanUsername = normalizeUsername(
      username || generateDefaultUsername(name, currentUser?.uid)
    );

    const candidateMember: Member = {
      id: memberId,
      username: cleanUsername,
      uid: currentUser?.uid,
      name: name.trim(),
      avatar,
      color,
      createdAt: existingMember?.createdAt || new Date().toISOString(),
    };

    // Register & verify unique @username in Firestore userDirectory
    const regResult = await cloudRegisterOrUpdateUserProfile(
      candidateMember,
      existingMember?.username
    );
    if (!regResult.success) {
      return { success: false, error: regResult.error };
    }

    const updatedMember = regResult.member || candidateMember;

    setAppState(prev => {
      const existsInMembers = prev.members.some(m => m.id === memberId);
      const updatedMembers = existsInMembers
        ? prev.members.map(m => (m.id === memberId ? updatedMember : m))
        : [updatedMember, ...prev.members];

      // Ensure all existing groups have an up-to-date GroupMember record for this user
      const updatedGroupMembers = prev.groupMembers.map(gm =>
        gm.memberId === memberId
          ? {
              ...gm,
              memberName: updatedMember.name,
              memberUsername: updatedMember.username,
              memberAvatar: updatedMember.avatar,
              memberColor: updatedMember.color,
              memberUid: updatedMember.uid,
            }
          : gm
      );

      for (const g of prev.groups) {
        const hasGm = updatedGroupMembers.some(
          gm => gm.groupId === g.id && gm.memberId === memberId
        );
        if (!hasGm) {
          const newGm: GroupMember = {
            id: `gm_${g.id}_${memberId}`,
            groupId: g.id,
            memberId,
            memberName: updatedMember.name,
            memberUsername: updatedMember.username,
            memberAvatar: updatedMember.avatar,
            memberColor: updatedMember.color,
            memberUid: updatedMember.uid,
          };
          updatedGroupMembers.push(newGm);
          cloudAddMember(
            { ...updatedMember, groupId: g.id },
            newGm,
            g.createdBy === currentUser?.uid
          );
        }
      }

      const nextState: AppState = {
        ...prev,
        userProfile: updatedMember,
        currentUserId: memberId,
        members: updatedMembers,
        groupMembers: updatedGroupMembers,
      };

      // If user already has groups, sync updated member profile to cloud
      if (nextState.groups.length > 0) {
        cloudUploadFullState(nextState, currentUser);
      }

      return nextState;
    });

    setIsEditProfileOpen(false);
    showToast(`Profile saved as @${updatedMember.username}!`, 'success');
    return { success: true };
  };

  // Create Group handler
  const handleGroupCreated = async (newGroup: Group, newMembers: Member[]) => {
    const existingMemberIds = new Set(appState.members.map(m => m.id));
    const membersToAdd = newMembers.filter(m => !existingMemberIds.has(m.id));

    // Ensure invite code is guaranteed unique across local state and cloud
    const existingCodes = appState.groups.map(g => g.inviteCode || '').filter(Boolean);
    const uniqueInviteCode = newGroup.inviteCode || (await generateGuaranteedUniqueInviteCode(existingCodes));

    const uid = currentUser?.uid || 'anonymous';
    const preparedGroup: Group = {
      ...newGroup,
      createdBy: uid,
      memberUserIds: Array.from(new Set([...(newGroup.memberUserIds || []), uid])),
      inviteCode: uniqueInviteCode,
    };

    const newGroupMembers: GroupMember[] = newMembers.map(m => ({
      id: `gm_${preparedGroup.id}_${m.id}`,
      groupId: preparedGroup.id,
      memberId: m.id,
      memberName: m.name,
      memberUsername: m.username,
      memberAvatar: m.avatar,
      memberColor: m.color,
      memberUid: m.uid,
    }));

    setAppState(prev => ({
      ...prev,
      groups: [preparedGroup, ...prev.groups],
      members: [...prev.members, ...membersToAdd],
      groupMembers: [...prev.groupMembers, ...newGroupMembers],
      pendingGroupIds: Array.from(new Set([...(prev.pendingGroupIds || []), preparedGroup.id])),
      deletedGroupIds: (prev.deletedGroupIds || []).filter(id => id !== preparedGroup.id),
      activeGroupId: preparedGroup.id,
      currentUserId: prev.currentUserId || newMembers[0]?.id || '',
    }));

    // Sync to Cloud Firestore with all group members (including the creator's own member profile)
    cloudCreateGroup(preparedGroup, newMembers, newGroupMembers, currentUser).then(res => {
      if (res.success) {
        setAppState(prev => ({
          ...prev,
          pendingGroupIds: (prev.pendingGroupIds || []).filter(id => id !== preparedGroup.id),
        }));
      }
    });

    setActiveGroupId(preparedGroup.id);
    showToast(`Group "${preparedGroup.name}" created with private invite code #${preparedGroup.inviteCode}!`, 'success');
  };

  // Join Group with Invite Code handler
  const handleJoinGroup = async (code: string): Promise<boolean> => {
    if (!currentUser) {
      showToast('Connecting user session...', 'info');
      return false;
    }

    const result = await joinGroupByInviteCode(code, currentUser);
    if (result.success && result.group) {
      const joinedGroup = result.group;
      const myProfile =
        appState.userProfile ||
        appState.members.find(m => m.id === appState.currentUserId);

      if (myProfile) {
        const gmId = `gm_${joinedGroup.id}_${myProfile.id}`;
        const newGm: GroupMember = {
          id: gmId,
          groupId: joinedGroup.id,
          memberId: myProfile.id,
          memberName: myProfile.name,
          memberUsername: myProfile.username,
          memberAvatar: myProfile.avatar,
          memberColor: myProfile.color,
          memberUid: currentUser.uid,
        };
        cloudAddMember(
          { ...myProfile, uid: currentUser.uid, groupId: joinedGroup.id },
          newGm,
          joinedGroup.createdBy === currentUser.uid
        );

        setAppState(prev => {
          const groupExists = prev.groups.some(g => g.id === joinedGroup.id);
          const gmExists = prev.groupMembers.some(
            gm => gm.groupId === joinedGroup.id && gm.memberId === myProfile.id
          );
          const memberExists = prev.members.some(m => m.id === myProfile.id);

          return {
            ...prev,
            groups: groupExists
              ? prev.groups.map(g => (g.id === joinedGroup.id ? joinedGroup : g))
              : [joinedGroup, ...prev.groups],
            members: memberExists ? prev.members : [myProfile, ...prev.members],
            groupMembers: gmExists
              ? prev.groupMembers
              : [...prev.groupMembers, newGm],
            deletedGroupIds: (prev.deletedGroupIds || []).filter(id => id !== joinedGroup.id),
            activeGroupId: joinedGroup.id,
          };
        });
      } else {
        setAppState(prev => {
          const exists = prev.groups.some(g => g.id === joinedGroup.id);
          return {
            ...prev,
            groups: exists
              ? prev.groups.map(g => (g.id === joinedGroup.id ? joinedGroup : g))
              : [joinedGroup, ...prev.groups],
            deletedGroupIds: (prev.deletedGroupIds || []).filter(id => id !== joinedGroup.id),
            activeGroupId: joinedGroup.id,
          };
        });
      }

      setActiveGroupId(joinedGroup.id);
      showToast(result.message, 'success');
      return true;
    } else {
      showToast(result.message, 'error');
      throw new Error(result.message);
    }
  };

  // Settle handler
  const handleSettleRecorded = (record: SettlementRecord) => {
    setAppState(prev => ({
      ...prev,
      settlements: [record, ...prev.settlements],
    }));

    // Sync settlement to Cloud Firestore
    cloudSaveSettlement(record);
    showToast('Settlement recorded! Balances recalculated.', 'success');
  };

  // Add Verified Registered Member to Group (Restricted to Group Owner)
  const handleAddMemberToGroup = (verifiedMember: Member) => {
    if (!currentGroup) return;
    const isLocalCreator =
      !currentGroup.createdBy ||
      currentGroup.createdBy === 'anonymous' ||
      currentGroup.createdBy.startsWith('u_');
    const isOwner = isLocalCreator || currentGroup.createdBy === currentUser?.uid;
    if (!isOwner) {
      showToast('Only the group owner can directly add members. Share the group invite code instead.', 'error');
      return;
    }

    const newGroupMember: GroupMember = {
      id: `gm_${currentGroup.id}_${verifiedMember.id}`,
      groupId: currentGroup.id,
      memberId: verifiedMember.id,
      memberName: verifiedMember.name,
      memberUsername: verifiedMember.username,
      memberAvatar: verifiedMember.avatar,
      memberColor: verifiedMember.color,
      memberUid: verifiedMember.uid,
    };

    setAppState(prev => {
      const memberExists = prev.members.some(m => m.id === verifiedMember.id);
      const gmExists = prev.groupMembers.some(
        gm => gm.groupId === currentGroup.id && gm.memberId === verifiedMember.id
      );

      return {
        ...prev,
        groups: prev.groups.map(g =>
          g.id === currentGroup.id && verifiedMember.uid
            ? {
                ...g,
                memberUserIds: Array.from(
                  new Set([...(g.memberUserIds || []), verifiedMember.uid])
                ),
              }
            : g
        ),
        members: memberExists
          ? prev.members.map(m => (m.id === verifiedMember.id ? verifiedMember : m))
          : [...prev.members, verifiedMember],
        groupMembers: gmExists
          ? prev.groupMembers
          : [...prev.groupMembers, newGroupMember],
      };
    });

    // Sync verified member & group access to Cloud Firestore
    cloudAddMember(verifiedMember, newGroupMember, true);
  };

  // Update Group details (Restricted to Group Owner)
  const handleUpdateGroup = (updated: Partial<Group>) => {
    if (!currentGroup) return;
    const isLocalCreator =
      !currentGroup.createdBy ||
      currentGroup.createdBy === 'anonymous' ||
      currentGroup.createdBy.startsWith('u_');
    const isOwner = isLocalCreator || currentGroup.createdBy === currentUser?.uid;
    if (!isOwner) {
      showToast('Only the group owner can modify group settings.', 'error');
      return;
    }
    const mergedGroup: Group = {
      ...currentGroup,
      ...updated,
      createdBy: isLocalCreator && currentUser?.uid ? currentUser.uid : currentGroup.createdBy,
    };
    setAppState(prev => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id === currentGroup.id ? mergedGroup : g
      ),
    }));

    // Sync update to Cloud Firestore
    cloudUpdateGroup(currentGroup.id, updated, mergedGroup);
  };

  // Delete Group (Strictly restricted to Group Owner and when all balances are settled)
  const handleDeleteGroup = (groupId: string) => {
    const groupObj = appState.groups.find(g => g.id === groupId);
    const groupMembersToDelete = appState.groupMembers.filter(
      gm => gm.groupId === groupId
    );
    const groupMemberIds = new Set(groupMembersToDelete.map(gm => gm.memberId));
    const membersInGroup = appState.members.filter(m => groupMemberIds.has(m.id));

    const isLocalCreator =
      !groupObj?.createdBy ||
      groupObj.createdBy === 'anonymous' ||
      groupObj.createdBy.startsWith('u_');
    const isSoleMember =
      (groupObj?.memberUserIds?.length === 1 &&
        Boolean(currentUser?.uid) &&
        groupObj.memberUserIds.includes(currentUser.uid)) ||
      membersInGroup.length <= 1;
    const isOwner =
      isLocalCreator ||
      isSoleMember ||
      groupObj?.createdBy === currentUser?.uid;

    if (!isOwner) {
      showToast('Only the group owner is authorized to delete this group.', 'error');
      return;
    }

    const expensesToDelete = appState.expenses.filter(e => e.groupId === groupId);
    const expenseIdsToDelete = new Set(expensesToDelete.map(e => e.id));
    const sharesToDelete = appState.expenseShares.filter(s =>
      expenseIdsToDelete.has(s.expenseId)
    );
    const settlementsToDelete = appState.settlements.filter(
      s => s.groupId === groupId
    );

    if (groupObj && membersInGroup.length > 0) {
      const groupBalances = calculateMemberBalances(
        membersInGroup,
        expensesToDelete,
        sharesToDelete,
        settlementsToDelete
      );
      const pendingDebts = optimizeSettlements(groupBalances, groupObj.baseCurrency);
      if (pendingDebts.length > 0) {
        showToast(
          'Cannot delete group until all pending settlements are completed.',
          'error'
        );
        return;
      }
    }

    setAppState(prev => ({
      ...prev,
      groups: prev.groups.filter(g => g.id !== groupId),
      expenses: prev.expenses.filter(e => e.groupId !== groupId),
      expenseShares: prev.expenseShares.filter(s => !expenseIdsToDelete.has(s.expenseId)),
      settlements: prev.settlements.filter(s => s.groupId !== groupId),
      groupMembers: prev.groupMembers.filter(gm => gm.groupId !== groupId),
      deletedGroupIds: Array.from(new Set([...(prev.deletedGroupIds || []), groupId])),
      activeGroupId: null,
    }));
    setActiveGroupId(null);

    // Sync group deletion to Cloud Firestore
    cloudDeleteGroup(
      groupId,
      expensesToDelete,
      sharesToDelete,
      settlementsToDelete,
      groupMembersToDelete,
      groupObj?.inviteCode
    );
    showToast('Group deleted', 'info');
  };

  // Manual Sync handler
  const handleManualSync = async () => {
    setSyncStatus('syncing');
    try {
      await cloudUploadFullState(appState, currentUser);
      setSyncStatus('connected');
      showToast('Synced all data with Firestore cloud database!', 'success');
    } catch {
      setSyncStatus('error');
      showToast('Cloud synchronization failed.', 'error');
    }
  };

  // Export JSON
  const handleExportData = () => {
    const json = exportStateAsJSON(appState);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `splitzy-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported as JSON file!', 'success');
  };

  // Import JSON
  const handleImportDataClick = () => {
    fileInputRef.current?.click();
  };

  const handleRestoreBackupState = async (imported: AppState) => {
    const uid = currentUser?.uid;
    const oldOwnerId = imported.userProfile?.id || imported.currentUserId;
    const oldOwnerUid = imported.userProfile?.uid;

    const normalizedGroups = (imported.groups || []).map(g => {
      const wasOwner =
        !g.createdBy ||
        g.createdBy === 'anonymous' ||
        g.createdBy.startsWith('u_') ||
        (oldOwnerUid && g.createdBy === oldOwnerUid);
      const nextMemberUserIds = Array.from(
        new Set([...(g.memberUserIds || []), ...(uid ? [uid] : [])])
      );
      return {
        ...g,
        createdBy: wasOwner && uid ? uid : g.createdBy,
        memberUserIds: nextMemberUserIds,
      };
    });

    const normalizedMembers = (imported.members || []).map(m =>
      m.id === oldOwnerId && uid ? { ...m, uid } : m
    );
    const normalizedProfile =
      imported.userProfile && uid
        ? { ...imported.userProfile, uid }
        : imported.userProfile;

    const normalizedState: AppState = {
      ...imported,
      groups: normalizedGroups,
      members: normalizedMembers,
      userProfile: normalizedProfile,
      deletedGroupIds: [],
    };

    setAppState(normalizedState);
    setActiveGroupId(normalizedState.groups[0]?.id || null);
    await cloudUploadFullState(normalizedState, currentUser);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      const content = event.target?.result as string;
      const imported = importStateFromJSON(content);
      if (imported) {
        await handleRestoreBackupState(imported);
        showToast('Data imported and synced to Cloud!', 'success');
      } else {
        showToast('Failed to parse backup file.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const currentUserMember =
    appState.userProfile ||
    appState.members.find(m => m.id === appState.currentUserId) ||
    appState.members[0];

  const needsOnboarding = !appState.userProfile && appState.members.length === 0;

  // Strictly scope members to the active group's explicit GroupMember records
  // so members from past groups (e.g. User B from Demo) are NEVER automatically added to new groups!
  const currentGroupMembers = React.useMemo(() => {
    if (!currentGroup) return [];
    const groupGms = appState.groupMembers.filter(
      gm => gm.groupId === currentGroup.id
    );
    const memberById = new Map<string, Member>(
      appState.members.map(m => [m.id, m])
    );
    const scoped: Member[] = [];
    for (const gm of groupGms) {
      const existing = memberById.get(gm.memberId);
      if (existing) {
        scoped.push(existing);
      } else if (gm.memberName) {
        scoped.push({
          id: gm.memberId,
          name: gm.memberName,
          username: gm.memberUsername,
          avatar: gm.memberAvatar || '👤',
          color: gm.memberColor || '#670B27',
          uid: gm.memberUid,
          groupId: gm.groupId,
          createdAt: new Date().toISOString(),
        });
      }
    }
    if (scoped.length > 0) return scoped;
    return currentUserMember ? [currentUserMember] : [];
  }, [currentGroup, appState.groupMembers, appState.members, currentUserMember]);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors flex flex-col font-sans">
      {isAppLocked && (
        <AppLockScreen
          onUnlock={() => setIsAppLocked(false)}
          userName={currentUserMember?.name}
          language={appState.language}
        />
      )}

      {/* Hidden file input for backup imports */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
      />

      {/* Header with Cloud Sync Status, Group Actions, and Settings */}
      <Header
        language={appState.language}
        onCreateGroupClick={() => setIsCreateGroupOpen(true)}
        onJoinGroupClick={() => setIsJoinGroupOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onHomeClick={() => setActiveGroupId(null)}
        onLockAppClick={isAppLockEnabled() ? () => setIsAppLocked(true) : undefined}
        currentMember={currentUserMember}
        onEditUserClick={() => setIsEditProfileOpen(true)}
        syncStatus={syncStatus}
      />

      {/* Main Workspace Area */}
      <main className="grow max-w-5xl w-full mx-auto px-4 sm:px-6 py-7 sm:py-9">
        {currentGroup ? (
          <GroupDetail
            group={currentGroup}
            members={currentGroupMembers}
            expenses={appState.expenses}
            expenseShares={appState.expenseShares}
            settlements={appState.settlements}
            currentUserId={appState.currentUserId}
            onBackToDashboard={() => setActiveGroupId(null)}
            onAddExpenseClick={() => {
              setExpenseToEdit(null);
              setIsAddExpenseOpen(true);
            }}
            onEditExpenseClick={(expense, shares) => {
              setExpenseToEdit({ expense, shares });
              setIsAddExpenseOpen(true);
            }}
            onDeleteExpense={handleDeleteExpense}
            onOpenSettleModal={(fromId, toId, amount) => {
              setSettleParams({ fromId, toId, amount });
              setIsSettleModalOpen(true);
            }}
            onAddMemberToGroup={handleAddMemberToGroup}
            onUpdateGroup={handleUpdateGroup}
            onDeleteGroup={handleDeleteGroup}
            language={appState.language}
            onShowToast={showToast}
          />
        ) : (
          <Dashboard
            groups={appState.groups}
            members={appState.members}
            groupMembers={appState.groupMembers}
            expenses={appState.expenses}
            expenseShares={appState.expenseShares}
            settlements={appState.settlements}
            currentUserId={appState.currentUserId}
            onEditUserClick={() => setIsEditProfileOpen(true)}
            onSelectGroup={gid => setActiveGroupId(gid)}
            onCreateGroupClick={() => setIsCreateGroupOpen(true)}
            onJoinGroupClick={() => setIsJoinGroupOpen(true)}
            language={appState.language}
          />
        )}
      </main>

      {/* First-Time User Name Onboarding / Edit Profile Modal */}
      <UserOnboardingModal
        isOpen={needsOnboarding || isEditProfileOpen}
        initialName={currentUserMember?.name || ''}
        initialUsername={
          currentUserMember?.username ||
          (currentUserMember?.name
            ? generateDefaultUsername(currentUserMember.name, currentUser?.uid)
            : '')
        }
        initialAvatar={currentUserMember?.avatar || '👨‍💻'}
        initialColor={currentUserMember?.color || '#670B27'}
        isEditing={!needsOnboarding && isEditProfileOpen}
        onSaveUser={handleSaveUserProfile}
        onClose={() => setIsEditProfileOpen(false)}
        language={appState.language}
      />

      {/* Modals (Lazy-loaded with Suspense) */}
      <Suspense fallback={null}>
        {isAddExpenseOpen && currentGroup && (
          <AddExpenseModal
            onClose={() => {
              setIsAddExpenseOpen(false);
              setExpenseToEdit(null);
            }}
            group={currentGroup}
            members={currentGroupMembers}
            onSave={handleSaveExpense}
            onDelete={handleDeleteExpense}
            expenseToEdit={expenseToEdit}
            language={appState.language}
          />
        )}

        {isCreateGroupOpen && (
          <CreateGroupModal
            onClose={() => setIsCreateGroupOpen(false)}
            onGroupCreated={handleGroupCreated}
            currentUserMember={currentUserMember}
            language={appState.language}
          />
        )}

        {isJoinGroupOpen && (
          <JoinGroupModal
            isOpen={isJoinGroupOpen}
            language={appState.language}
            onClose={() => setIsJoinGroupOpen(false)}
            onJoin={handleJoinGroup}
          />
        )}

        {isSettleModalOpen && currentGroup && (
          <SettleModal
            onClose={() => setIsSettleModalOpen(false)}
            group={currentGroup}
            members={currentGroupMembers}
            initialFromId={settleParams.fromId}
            initialToId={settleParams.toId}
            initialAmount={settleParams.amount}
            currentUserId={appState.currentUserId}
            onSettle={handleSettleRecorded}
            language={appState.language}
          />
        )}

        {isTestRunnerOpen && (
          <TestRunnerModal
            onClose={() => setIsTestRunnerOpen(false)}
            language={appState.language}
          />
        )}

        {/* Security & Recovery Center Modal */}
        {isSecurityCenterOpen && (
          <SecurityCenterModal
            isOpen={isSecurityCenterOpen}
            onClose={() => setIsSecurityCenterOpen(false)}
            currentUser={currentUser}
            appState={appState}
            onRestoreState={restored => {
              handleRestoreBackupState(restored);
            }}
            onShowToast={showToast}
            language={appState.language}
          />
        )}

        {/* Settings Modal (Language Selection, Security & Recovery Center, Auto-Sync & Maintenance) */}
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            language={appState.language}
            onLanguageChange={lang =>
              setAppState(prev => ({ ...prev, language: lang }))
            }
            defaultCurrency={currentGroup?.baseCurrency || appState.groups[0]?.baseCurrency || 'NPR'}
            onCurrencyChange={nextCurr => {
              const targetGroup = currentGroup || appState.groups[0];
              if (targetGroup) {
                const updatedGroup = { ...targetGroup, baseCurrency: nextCurr };
                setAppState(prev => ({
                  ...prev,
                  groups: prev.groups.map(g =>
                    g.id === targetGroup.id ? updatedGroup : g
                  ),
                }));
                cloudUpdateGroup(targetGroup.id, { baseCurrency: nextCurr }, updatedGroup);
                showToast(`Base currency updated to ${nextCurr}`, 'success');
              }
            }}
            defaultCalendar={currentGroup?.preferredCalendar || appState.groups[0]?.preferredCalendar || 'BS'}
            onCalendarChange={nextCal => {
              const targetGroup = currentGroup || appState.groups[0];
              if (targetGroup) {
                const updatedGroup = { ...targetGroup, preferredCalendar: nextCal };
                setAppState(prev => ({
                  ...prev,
                  groups: prev.groups.map(g =>
                    g.id === targetGroup.id ? updatedGroup : g
                  ),
                }));
                cloudUpdateGroup(targetGroup.id, { preferredCalendar: nextCal }, updatedGroup);
                showToast(`Calendar mode updated to ${nextCal}`, 'success');
              }
            }}
            onOpenSecurityCenter={() => setIsSecurityCenterOpen(true)}
            onExportData={handleExportData}
            onImportData={handleImportDataClick}
            onManualSync={handleManualSync}
            onOpenTestRunner={() => setIsTestRunnerOpen(true)}
            onEditProfile={() => setIsEditProfileOpen(true)}
            onLockAppNow={() => setIsAppLocked(true)}
            currentMember={currentUserMember}
            syncStatus={syncStatus}
            userId={currentUser?.uid}
          />
        )}
      </Suspense>

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
