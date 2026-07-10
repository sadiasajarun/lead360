import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth, getHomeRouteForRole } from '~/contexts/AuthContext';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [err, setErr] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setErr('');
    try {
      const user = await login(values.email, values.password);
      navigate(getHomeRouteForRole(user.role));
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#FAFAF9] p-6">
      <section className="w-full max-w-[380px] rounded-lg border border-[#E8E6E3] bg-white p-8">
        <h1 className="text-xl font-semibold">Sign in to Lead360</h1>
        <p className="mb-6 mt-1 text-sm text-[#6B6660]">Riseup Labs proposal &amp; budget studio</p>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold">Email</label>
            <input
              id="email"
              data-testid="login-email"
              {...register('email')}
              className="h-10 w-full rounded-md border border-[#D4D1CC] px-3 text-sm outline-none focus:border-[#EA5400]"
              placeholder="you@riseuplabs.com"
              autoComplete="username"
            />
            {errors.email && <p className="mt-1 text-xs text-[#B42318]">Enter a valid email</p>}
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold">Password</label>
            <input
              id="password"
              data-testid="login-password"
              type="password"
              {...register('password')}
              className="h-10 w-full rounded-md border border-[#D4D1CC] px-3 text-sm outline-none focus:border-[#EA5400]"
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {errors.password && <p className="mt-1 text-xs text-[#B42318]">Min 6 characters</p>}
          </div>
          {err && <p data-testid="login-error" className="text-xs text-[#B42318]">{err}</p>}
          <button
            data-testid="login-submit"
            type="submit"
            disabled={isSubmitting}
            className="mt-2 h-10 rounded-md bg-[#EA5400] text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
