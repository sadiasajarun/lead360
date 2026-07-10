import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { fetchMe } from '~/services/httpServices/authService';
import type { AuthState, AuthUser } from '~/types/auth';

const initialState: AuthState = { user: null, status: 'idle' };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = 'authenticated';
    },
    clearUser(state) {
      state.user = null;
      state.status = 'unauthenticated';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMe.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'authenticated';
      })
      .addCase(fetchMe.rejected, (state) => {
        state.user = null;
        state.status = 'unauthenticated';
      });
  },
});

export const { setUser, clearUser } = authSlice.actions;
export default authSlice.reducer;
