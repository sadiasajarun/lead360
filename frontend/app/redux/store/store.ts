import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/authSlice';
import leadsReducer from '../features/leadsSlice';
import leadDetailReducer from '../features/leadDetailSlice';
import budgetReducer from '../features/budgetSlice';
import projectsReducer from '../features/projectsSlice';
import analyticsReducer from '../features/analyticsSlice';
import approvalsReducer from '../features/approvalsSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    leads: leadsReducer,
    leadDetail: leadDetailReducer,
    budget: budgetReducer,
    projects: projectsReducer,
    analytics: analyticsReducer,
    approvals: approvalsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
