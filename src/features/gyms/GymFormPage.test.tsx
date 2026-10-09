import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeGymService, sampleGym } from '../../test/fakeGyms';
import { createFakeAuthService } from '../../test/fakeAuth';
import { AuthProvider } from '../auth';
import { GymFormPage } from './GymFormPage';
import { GymServiceProvider } from './GymServiceContext';

function renderForm(path: string, fake = createFakeGymService()) {
  const auth = createFakeAuthService({ id: 'u1', email: 'a@b.co' });
  const router = createMemoryRouter(
    [
      { path: '/gyms', element: <p>Gyms list</p> },
      { path: '/gyms/new', element: <GymFormPage /> },
      { path: '/gyms/:gymId', element: <GymFormPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <AuthProvider service={auth.service}>
      <GymServiceProvider service={fake.service}>
        <RouterProvider router={router} />
      </GymServiceProvider>
    </AuthProvider>,
  );
  return { fake, router, user: userEvent.setup() };
}

const ezGym = sampleGym({
  bars: [
    { id: 'b1', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' },
    { id: 'b2', name: 'Trap bar', weightKg: 25, kind: 'other' },
  ],
});

describe('new gym', () => {
  it('starts with a 20 kg barbell and offers 20 and 15 kg presets', async () => {
    const { user } = renderForm('/gyms/new');
    const barbell = await screen.findByLabelText('Barbell weight (kg)');
    expect(barbell).toHaveValue('20');
    expect(screen.getByRole('button', { name: '20 kg' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '15 kg' }));
    expect(barbell).toHaveValue('15');
    expect(screen.getByRole('button', { name: '15 kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '20 kg' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('creates the first gym as the default and returns to the list', async () => {
    const { fake, router, user } = renderForm('/gyms/new');
    await user.type(await screen.findByLabelText('Gym name'), '  Home gym ');
    await user.click(screen.getByRole('button', { name: '15 kg' }));
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(fake.service.create).toHaveBeenCalledWith(
      'u1',
      expect.any(String),
      { name: 'Home gym', barbellKg: 15, bars: [] },
      true,
    );
    expect(await screen.findByText('Gyms list')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/gyms');
  });

  it('does not make a later gym the default when one already is', async () => {
    const { fake, user } = renderForm('/gyms/new', createFakeGymService([sampleGym()]));
    await user.type(await screen.findByLabelText('Gym name'), 'Office');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(fake.service.create).toHaveBeenCalledWith(
      'u1',
      expect.any(String),
      expect.anything(),
      false,
    );
  });

  it('does not claim the default for a later gym, even when none is marked', async () => {
    const { fake, user } = renderForm(
      '/gyms/new',
      createFakeGymService([sampleGym({ isDefault: false })]),
    );
    await user.type(await screen.findByLabelText('Gym name'), 'Office');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(fake.service.create).toHaveBeenCalledWith(
      'u1',
      expect.any(String),
      expect.anything(),
      false,
    );
  });

  it('shows field errors, focuses the first bad field and saves nothing', async () => {
    const { fake, user } = renderForm('/gyms/new');
    const barbell = await screen.findByLabelText('Barbell weight (kg)');
    await user.clear(barbell);
    await user.type(barbell, '500');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(screen.getByLabelText('Gym name')).toBeInvalid();
    expect(screen.getByLabelText('Gym name')).toHaveFocus();
    expect(screen.getByText(/give the gym a name/i)).toBeInTheDocument();
    expect(barbell).toBeInvalid();
    expect(fake.service.create).not.toHaveBeenCalled();
  });

  it('adds a bar of a kind, prefilling its name, and sends it with the gym', async () => {
    const { fake, user } = renderForm('/gyms/new');
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'EZ bar' }));
    expect(screen.getByLabelText('Bar name')).toHaveValue('EZ bar');
    await user.type(screen.getByLabelText('Bar weight (kg)'), '7,5');
    await user.click(screen.getByRole('button', { name: 'Add bar' }));
    expect(screen.getByLabelText('EZ bar weight (kg)')).toHaveValue('7,5');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(fake.service.create).toHaveBeenCalledWith(
      'u1',
      expect.any(String),
      {
        name: 'Home',
        barbellKg: 20,
        bars: [{ id: expect.any(String), name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }],
      },
      true,
    );
  });

  it('only offers each special bar once per gym', async () => {
    const { user } = renderForm('/gyms/new');
    await user.click(await screen.findByRole('button', { name: 'Smith bar' }));
    await user.type(screen.getByLabelText('Bar weight (kg)'), '12');
    await user.click(screen.getByRole('button', { name: 'Add bar' }));
    expect(screen.getByRole('button', { name: 'Smith bar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'EZ bar' })).toBeEnabled();
  });

  it('refuses a bad new bar next to the fields and leaves the list alone', async () => {
    const { user } = renderForm('/gyms/new');
    await user.click(await screen.findByRole('button', { name: 'Other' }));
    await user.type(screen.getByLabelText('Bar weight (kg)'), '150');
    await user.click(screen.getByRole('button', { name: 'Add bar' }));
    expect(screen.getByLabelText('Bar name')).toBeInvalid();
    expect(screen.getByLabelText('Bar weight (kg)')).toBeInvalid();
    expect(screen.queryByRole('button', { name: /^remove/i })).not.toBeInTheDocument();
  });

  it('refuses a bar name that is already used', async () => {
    const { user } = renderForm('/gyms/new');
    for (const weight of ['20', '21']) {
      await user.click(await screen.findByRole('button', { name: 'Other' }));
      await user.clear(screen.getByLabelText('Bar name'));
      await user.type(screen.getByLabelText('Bar name'), 'Axle bar');
      await user.clear(screen.getByLabelText('Bar weight (kg)'));
      await user.type(screen.getByLabelText('Bar weight (kg)'), weight);
      await user.click(screen.getByRole('button', { name: 'Add bar' }));
    }
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^remove/i })).toHaveLength(1);
  });

  it('removes a bar from the list', async () => {
    const { user } = renderForm('/gyms/new');
    await user.click(await screen.findByRole('button', { name: 'EZ bar' }));
    await user.type(screen.getByLabelText('Bar weight (kg)'), '7.5');
    await user.click(screen.getByRole('button', { name: 'Add bar' }));
    await user.click(screen.getByRole('button', { name: 'Remove EZ bar' }));
    expect(screen.queryByLabelText('EZ bar weight (kg)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EZ bar' })).toBeEnabled();
  });

  it('shows a saving state and ignores a second tap', async () => {
    const fake = createFakeGymService();
    let release: () => void = () => undefined;
    fake.service.create.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve({ status: 'ok', value: undefined });
      }),
    );
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    const saving = screen.getByRole('button', { name: /saving/i });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(fake.service.create).toHaveBeenCalledTimes(1);
    release();
    expect(await screen.findByText('Gyms list')).toBeInTheDocument();
  });

  it.each([
    ['offline', /offline/i],
    ['unknown', /could not save/i],
  ] as const)('keeps the form and explains a %s failure', async (reason, message) => {
    const fake = createFakeGymService();
    fake.failNext('create', reason);
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Gym name')).toHaveValue('Home');
    expect(screen.getByRole('button', { name: 'Create gym' })).toBeEnabled();
  });
});

describe('edit gym', () => {
  it('loads the gym into the form', async () => {
    renderForm('/gyms/g1', createFakeGymService([ezGym]));
    expect(await screen.findByLabelText('Gym name')).toHaveValue('Home gym');
    expect(screen.getByLabelText('Barbell weight (kg)')).toHaveValue('15');
    expect(screen.getByLabelText('EZ bar weight (kg)')).toHaveValue('7.5');
    expect(screen.getByLabelText('Trap bar weight (kg)')).toHaveValue('25');
  });

  it('saves changes, keeping ids of the bars that stay', async () => {
    const { fake, user } = renderForm('/gyms/g1', createFakeGymService([ezGym]));
    const ez = await screen.findByLabelText('EZ bar weight (kg)');
    await user.clear(ez);
    await user.type(ez, '8');
    await user.click(screen.getByRole('button', { name: 'Remove Trap bar' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(fake.service.update).toHaveBeenCalledWith('u1', 'g1', {
      name: 'Home gym',
      barbellKg: 15,
      bars: [{ id: 'b1', name: 'EZ bar', weightKg: 8, kind: 'ez_bar' }],
    });
    expect(await screen.findByText('Gyms list')).toBeInTheDocument();
  });

  it('reports a bad weight on the bar it belongs to', async () => {
    const { fake, user } = renderForm('/gyms/g1', createFakeGymService([ezGym]));
    const ez = await screen.findByLabelText('EZ bar weight (kg)');
    await user.clear(ez);
    await user.type(ez, 'abc');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(ez).toBeInvalid();
    expect(ez).toHaveFocus();
    expect(fake.service.update).not.toHaveBeenCalled();
  });

  it('makes the gym the default, and then hides the button', async () => {
    const other = sampleGym({ id: 'g2', name: 'Office', isDefault: false });
    const { fake, user } = renderForm('/gyms/g2', createFakeGymService([sampleGym(), other]));
    await user.click(await screen.findByRole('button', { name: /make this my default gym/i }));
    expect(fake.service.setDefault).toHaveBeenCalledWith('g2');
    expect(await screen.findByText(/this is your default gym/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /make this my default gym/i }),
    ).not.toBeInTheDocument();
  });

  it('does not offer to make the default gym the default again', async () => {
    renderForm('/gyms/g1', createFakeGymService([sampleGym()]));
    expect(await screen.findByText(/this is your default gym/i)).toBeInTheDocument();
  });

  it('asks before deleting, and cancelling deletes nothing', async () => {
    const { fake, user } = renderForm('/gyms/g1', createFakeGymService([sampleGym()]));
    await user.click(await screen.findByRole('button', { name: 'Delete gym' }));
    expect(screen.getByText(/delete home gym\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/delete home gym\?/i)).not.toBeInTheDocument();
    expect(fake.service.remove).not.toHaveBeenCalled();
  });

  it('deletes after confirmation and returns to the list', async () => {
    const { fake, user } = renderForm('/gyms/g1', createFakeGymService([sampleGym()]));
    await user.click(await screen.findByRole('button', { name: 'Delete gym' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(fake.service.remove).toHaveBeenCalledWith('g1');
    expect(await screen.findByText('Gyms list')).toBeInTheDocument();
  });

  it('explains a failed delete and keeps the gym', async () => {
    const fake = createFakeGymService([sampleGym()]);
    fake.failNext('remove');
    const { user } = renderForm('/gyms/g1', fake);
    await user.click(await screen.findByRole('button', { name: 'Delete gym' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not delete/i);
    expect(fake.current()).toHaveLength(1);
  });

  it('says when the gym does not exist', async () => {
    renderForm('/gyms/nope', createFakeGymService([sampleGym()]));
    expect(await screen.findByRole('heading', { name: /gym not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to gyms/i })).toHaveAttribute('href', '/gyms');
  });

  it('shows a retry when the gym cannot be loaded', async () => {
    const fake = createFakeGymService([sampleGym()]);
    fake.failNext('list');
    const { user } = renderForm('/gyms/g1', fake);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByLabelText('Gym name')).toHaveValue('Home gym');
  });
});

describe('review fixes', () => {
  it('retries a failed create with the same gym and bar ids, so it cannot make a second gym', async () => {
    const fake = createFakeGymService();
    fake.failNext('create', 'offline');
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'EZ bar' }));
    await user.type(screen.getByLabelText('Bar weight (kg)'), '7.5');
    await user.click(screen.getByRole('button', { name: 'Add bar' }));
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    const [first, second] = fake.service.create.mock.calls;
    expect(second?.[1]).toBe(first?.[1]);
    expect(second?.[2].bars[0]?.id).toBe(first?.[2].bars[0]?.id);
  });

  it('adds the bar when Enter is pressed in the add-bar fields, and does not save the gym', async () => {
    const { fake, user } = renderForm('/gyms/new');
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'EZ bar' }));
    await user.type(screen.getByLabelText('Bar weight (kg)'), '7.5{Enter}');
    expect(screen.getByLabelText('EZ bar weight (kg)')).toBeInTheDocument();
    expect(fake.service.create).not.toHaveBeenCalled();
  });

  it('does not silently drop a bar that was typed but never added', async () => {
    const { fake, user } = renderForm('/gyms/new');
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'EZ bar' }));
    await user.type(screen.getByLabelText('Bar weight (kg)'), '7.5');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(screen.getByText(/tap add bar/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Bar weight (kg)')).toBeInvalid();
    expect(fake.service.create).not.toHaveBeenCalled();
  });

  it('does not nag about the prefilled name of a bar kind that was only selected', async () => {
    const { fake, user } = renderForm('/gyms/new');
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'EZ bar' }));
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(fake.service.create).toHaveBeenCalled();
  });

  it('clears a field error as soon as the user edits the field', async () => {
    const { user } = renderForm('/gyms/new');
    await user.click(await screen.findByRole('button', { name: 'Create gym' }));
    expect(screen.getByLabelText('Gym name')).toBeInvalid();
    await user.type(screen.getByLabelText('Gym name'), 'H');
    expect(screen.getByLabelText('Gym name')).not.toBeInvalid();
  });

  it('explains a duplicate name or kind reported by the server', async () => {
    const fake = createFakeGymService();
    fake.failNext('create', 'conflict');
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already has a bar/i);
  });

  it('treats the oldest gym as the default when none is marked, in the form and on the list', async () => {
    const unmarked = [
      sampleGym({ isDefault: false }),
      sampleGym({ id: 'g2', name: 'Office', isDefault: false, createdAt: '2026-10-05T00:00:00Z' }),
    ];
    renderForm('/gyms/g1', createFakeGymService(unmarked));
    expect(await screen.findByText(/this is your default gym/i)).toBeInTheDocument();
  });
});
