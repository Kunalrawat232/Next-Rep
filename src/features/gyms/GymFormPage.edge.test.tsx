import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { createFakeGymService, sampleGym } from '../../test/fakeGyms';
import { AuthProvider } from '../auth';
import { GymFormPage } from './GymFormPage';
import { GymServiceProvider } from './GymServiceContext';
import type { GymResult } from './types';

function renderForm(path: string, fake = createFakeGymService(), signedIn = true) {
  const auth = createFakeAuthService(signedIn ? { id: 'u1', email: 'a@b.co' } : null);
  const router = createMemoryRouter(
    [
      { path: '/gyms', element: <p>Gyms list</p> },
      { path: '/elsewhere', element: <p>Elsewhere</p> },
      { path: '/gyms/new', element: <GymFormPage /> },
      { path: '/gyms/:gymId', element: <GymFormPage /> },
    ],
    { initialEntries: [path] },
  );
  const view = render(
    <AuthProvider service={auth.service}>
      <GymServiceProvider service={fake.service}>
        <RouterProvider router={router} />
      </GymServiceProvider>
    </AuthProvider>,
  );
  return { fake, router, view, user: userEvent.setup() };
}

const ezGym = sampleGym({
  bars: [
    { id: 'b1', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' },
    { id: 'b2', name: 'Trap bar', weightKg: 25, kind: 'other' },
  ],
});

const pendingOnce = <T,>() => {
  let resolve: (r: GymResult<T>) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<GymResult<T>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

afterEach(() => vi.restoreAllMocks());

// Two gyms where g1 is not the default: g0 is older and marked.
const notTheDefault = [
  sampleGym({ id: 'g0', name: 'Older gym', isDefault: true, createdAt: '2026-09-01T00:00:00Z' }),
  sampleGym({ isDefault: false }),
];

describe('GymFormPage: route params', () => {
  it.each([
    ['an unknown id', '/gyms/zzz'],
    ['a different case of a real id', '/gyms/G1'],
    ['an id with a trailing space', '/gyms/g1%20'],
    ['an encoded slash', '/gyms/g1%2Fx'],
    ['only an encoded space', '/gyms/%20'],
    ['a very long id', `/gyms/${'a'.repeat(2000)}`],
    ['an id that looks like markup', '/gyms/%3Cscript%3E'],
    ['an id that looks like a prototype key', '/gyms/__proto__'],
    ['an id made of Devanagari', `/gyms/${encodeURIComponent('जिम')}`],
  ])('says the gym was not found for %s', async (_label, path) => {
    renderForm(path, createFakeGymService([sampleGym()]));
    expect(await screen.findByRole('heading', { name: 'Gym not found' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Gym name')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to gyms' })).toHaveAttribute('href', '/gyms');
  });

  it('shows not found, not a new-gym form, when there are no gyms at all', async () => {
    renderForm('/gyms/g1', createFakeGymService([]));
    expect(await screen.findByRole('heading', { name: 'Gym not found' })).toBeInTheDocument();
  });

  it('renders nothing and calls no write while signed out', async () => {
    const { fake } = renderForm('/gyms/new', createFakeGymService(), false);
    await Promise.resolve();
    expect(screen.queryByLabelText('Gym name')).not.toBeInTheDocument();
    expect(fake.service.create).not.toHaveBeenCalled();
  });

  it('recovers from a load failure with retry, for the edit route too', async () => {
    const fake = createFakeGymService([ezGym]);
    fake.failNext('list', 'offline');
    const { user } = renderForm('/gyms/g1', fake);
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Gym name')).toHaveValue('Home gym');
  });

  it('shows the error state when list() rejects instead of staying on loading forever', async () => {
    const fake = createFakeGymService();
    fake.service.list.mockRejectedValueOnce(new Error('x'));
    renderForm('/gyms/new', fake);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('GymFormPage: odd input', () => {
  const fillAndSave = async (
    user: ReturnType<typeof userEvent.setup>,
    name: string,
    barbell: string,
  ) => {
    const nameField = await screen.findByLabelText('Gym name');
    if (name) await user.type(nameField, name);
    const field = screen.getByLabelText('Barbell weight (kg)');
    await user.clear(field);
    if (barbell) await user.type(field, barbell);
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
  };

  it.each([
    ['spaces around the barbell weight', '  20  ', 20],
    ['a comma decimal', '17,5', 17.5],
    ['more than two decimals', '17.504', 17.5],
  ])('saves %s', async (_l, text, kg) => {
    const fake = createFakeGymService();
    const { user } = renderForm('/gyms/new', fake);
    await fillAndSave(user, 'Gym', text);
    expect(fake.service.create).toHaveBeenCalledWith(
      'u1',
      expect.any(String),
      { name: 'Gym', barbellKg: kg, bars: [] },
      true,
    );
  });

  it.each([
    ['an exponent', '1e1'],
    ['a unit', '20kg'],
    ['empty', ''],
    ['over the max', '101'],
    ['digits from another script', '٢٠'],
  ])('refuses %s, shows the message on the barbell field and saves nothing', async (_l, text) => {
    const fake = createFakeGymService();
    const { user } = renderForm('/gyms/new', fake);
    await fillAndSave(user, 'Gym', text);
    expect(fake.service.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Barbell weight (kg)')).toBeInvalid();
    expect(screen.getByLabelText('Barbell weight (kg)')).toHaveFocus();
  });

  it('refuses a whitespace-only name and keeps what was typed in the other fields', async () => {
    const fake = createFakeGymService();
    const { user } = renderForm('/gyms/new', fake);
    await fillAndSave(user, '   ', '15');
    expect(fake.service.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Gym name')).toBeInvalid();
    expect(screen.getByLabelText('Barbell weight (kg)')).toHaveValue('15');
  });

  it('saves a Devanagari name with a markup-looking name unchanged', async () => {
    const fake = createFakeGymService();
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'जिम <b>');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(fake.service.create).toHaveBeenCalledWith(
      'u1',
      expect.any(String),
      expect.objectContaining({ name: 'जिम <b>' }),
      true,
    );
  });

  it('clears the field errors once the form is fixed and saved', async () => {
    const fake = createFakeGymService();
    const { user } = renderForm('/gyms/new', fake);
    await fillAndSave(user, '', '15');
    expect(screen.getByLabelText('Gym name')).toBeInvalid();
    await user.type(screen.getByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(await screen.findByText('Gyms list')).toBeInTheDocument();
    expect(fake.service.create).toHaveBeenCalledTimes(1);
  });
});

describe('GymFormPage: bar presets and the add-bar box', () => {
  it('ends in a consistent state after rapid barbell chip toggling', async () => {
    const { user } = renderForm('/gyms/new');
    const field = await screen.findByLabelText('Barbell weight (kg)');
    for (const kg of ['15', '20', '15', '15', '20', '15']) {
      await user.click(screen.getByRole('button', { name: `${kg} kg` }));
    }
    expect(field).toHaveValue('15');
    expect(screen.getByRole('button', { name: '15 kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '20 kg' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows no chip as selected when the typed weight matches no preset, and re-selects on exact retype', async () => {
    const { user } = renderForm('/gyms/new');
    const field = await screen.findByLabelText('Barbell weight (kg)');
    await user.clear(field);
    await user.type(field, '20.0');
    expect(screen.getByRole('button', { name: '20 kg' })).toHaveAttribute('aria-pressed', 'false');
    await user.clear(field);
    await user.type(field, ' 15 ');
    expect(screen.getByRole('button', { name: '15 kg' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('makes the bar name follow the kind chip through rapid kind changes, but keeps a typed name', async () => {
    const { user } = renderForm('/gyms/new');
    const name = await screen.findByLabelText('Bar name');
    await user.click(screen.getByRole('button', { name: 'EZ bar' }));
    expect(name).toHaveValue('EZ bar');
    await user.click(screen.getByRole('button', { name: 'Smith bar' }));
    expect(name).toHaveValue('Smith bar');
    await user.click(screen.getByRole('button', { name: 'Other' }));
    expect(name).toHaveValue('');
    await user.type(name, 'Axle bar');
    await user.click(screen.getByRole('button', { name: 'EZ bar' }));
    expect(name).toHaveValue('Axle bar');
  });

  it('gives the kind chip back after its bar is removed', async () => {
    const { user } = renderForm('/gyms/g1', createFakeGymService([ezGym]));
    await screen.findByLabelText('Gym name');
    expect(screen.getByRole('button', { name: 'EZ bar' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove EZ bar' }));
    expect(screen.getByRole('button', { name: 'EZ bar' })).toBeEnabled();
  });

  it('refuses a bar with a blank name or an odd weight and keeps the typed values', async () => {
    const { user } = renderForm('/gyms/new');
    await user.type(await screen.findByLabelText('Bar name'), '   ');
    await user.type(screen.getByLabelText('Bar weight (kg)'), '1e3');
    await user.click(screen.getByRole('button', { name: 'Add bar' }));
    expect(screen.getByLabelText('Bar name')).toBeInvalid();
    expect(screen.getByLabelText('Bar weight (kg)')).toBeInvalid();
    expect(screen.getByLabelText('Bar weight (kg)')).toHaveValue('1e3');
    expect(screen.getByText('Optional. You can add more later.')).toBeInTheDocument();
  });

  it('refuses a duplicate name that differs only by case and padding', async () => {
    const { user } = renderForm('/gyms/new');
    const add = async (name: string, kg: string) => {
      await user.clear(screen.getByLabelText('Bar name'));
      await user.type(screen.getByLabelText('Bar name'), name);
      await user.clear(screen.getByLabelText('Bar weight (kg)'));
      await user.type(screen.getByLabelText('Bar weight (kg)'), kg);
      await user.click(screen.getByRole('button', { name: 'Add bar' }));
    };
    await screen.findByLabelText('Bar name');
    await add('Trap bar', '25');
    await add('  TRAP BAR ', '30');
    expect(screen.getAllByLabelText(/weight \(kg\)$/i).filter((e) => e.id !== '')).not.toHaveLength(
      0,
    );
    expect(screen.getByLabelText('Bar name')).toBeInvalid();
    expect(screen.queryAllByRole('button', { name: /^Remove / })).toHaveLength(1);
  });

  it('adds 12 bars one after another and sends all of them in order', async () => {
    const fake = createFakeGymService();
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Big gym');
    for (let i = 0; i < 12; i++) {
      await user.type(screen.getByLabelText('Bar name'), `Bar ${i}`);
      await user.type(screen.getByLabelText('Bar weight (kg)'), String(i + 1));
      await user.click(screen.getByRole('button', { name: 'Add bar' }));
    }
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(12);
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    const sent = fake.service.create.mock.calls[0]![2];
    expect(sent.bars.map((b) => b.name)).toEqual(Array.from({ length: 12 }, (_, i) => `Bar ${i}`));
    expect(sent.bars.map((b) => b.weightKg)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  }, 20000);

  it('pressing Enter in the add-bar fields adds the bar instead of saving the whole gym', async () => {
    const fake = createFakeGymService();
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.type(screen.getByLabelText('Bar name'), 'Trap bar');
    await user.type(screen.getByLabelText('Bar weight (kg)'), '25{Enter}');
    expect(fake.service.create).not.toHaveBeenCalled();
  });
});

describe('GymFormPage: saving, failures and retries', () => {
  it('keeps the form when save throws, then saves on retry and goes back to the list', async () => {
    const fake = createFakeGymService();
    fake.service.create.mockRejectedValueOnce(new Error('socket'));
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
    expect(screen.getByRole('button', { name: 'Create gym' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(await screen.findByText('Gyms list')).toBeInTheDocument();
    expect(fake.service.create).toHaveBeenCalledTimes(2);
  });

  it('clears the previous failure message when the next attempt starts', async () => {
    const fake = createFakeGymService();
    fake.failNext('create');
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    await screen.findByRole('alert');
    const gate = pendingOnce<void>();
    fake.service.create.mockReturnValueOnce(gate.promise);
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    gate.resolve({ status: 'ok', value: undefined });
    expect(await screen.findByText('Gyms list')).toBeInTheDocument();
  });

  it('disables every field and chip while saving', async () => {
    const fake = createFakeGymService();
    const gate = pendingOnce<void>();
    fake.service.create.mockReturnValueOnce(gate.promise);
    const { user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    for (const label of ['Gym name', 'Barbell weight (kg)', 'Bar name', 'Bar weight (kg)'])
      expect(screen.getByLabelText(label)).toBeDisabled();
    for (const name of ['15 kg', '20 kg', 'EZ bar', 'Other', 'Add bar'])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    gate.resolve({ status: 'ok', value: undefined });
    await screen.findByText('Gyms list');
  });

  it('sends one update when Save changes is double clicked', async () => {
    const fake = createFakeGymService([ezGym]);
    const { user } = renderForm('/gyms/g1', fake);
    await screen.findByLabelText('Gym name');
    await user.dblClick(screen.getByRole('button', { name: 'Save changes' }));
    expect(fake.service.update).toHaveBeenCalledTimes(1);
  });

  it('navigating away while a save is in flight still gets pulled back to the list when it finishes', async () => {
    const fake = createFakeGymService();
    const gate = pendingOnce<void>();
    fake.service.create.mockReturnValueOnce(gate.promise);
    const { router, user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    await router.navigate('/elsewhere');
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
    gate.resolve({ status: 'ok', value: undefined });
    await Promise.resolve();
    await Promise.resolve();
    expect(router.state.location.pathname).toBe('/elsewhere');
  });

  it('does not log errors when a save fails after the form is gone', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeGymService();
    const gate = pendingOnce<void>();
    fake.service.create.mockReturnValueOnce(gate.promise);
    const { view, user } = renderForm('/gyms/new', fake);
    await user.type(await screen.findByLabelText('Gym name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Create gym' }));
    view.unmount();
    gate.reject(new Error('late'));
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('GymFormPage: default and delete actions', () => {
  it('a double click on "Make this my default gym" calls setDefault once', async () => {
    const fake = createFakeGymService(notTheDefault);
    const gate = pendingOnce<void>();
    fake.service.setDefault.mockReturnValue(gate.promise);
    const { user } = renderForm('/gyms/g1', fake);
    await screen.findByLabelText('Gym name');
    await user.dblClick(screen.getByRole('button', { name: 'Make this my default gym' }));
    expect(fake.service.setDefault).toHaveBeenCalledTimes(1);
    gate.resolve({ status: 'ok', value: undefined });
  });

  it('a double click on "Yes, delete" calls remove once', async () => {
    const fake = createFakeGymService([ezGym]);
    const gate = pendingOnce<void>();
    fake.service.remove.mockReturnValue(gate.promise);
    const { user } = renderForm('/gyms/g1', fake);
    await screen.findByLabelText('Gym name');
    await user.click(screen.getByRole('button', { name: 'Delete gym' }));
    await user.dblClick(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(fake.service.remove).toHaveBeenCalledTimes(1);
    gate.resolve({ status: 'ok', value: undefined });
  });

  it('keeps the default button when setDefault throws, and explains', async () => {
    const fake = createFakeGymService(notTheDefault);
    fake.service.setDefault.mockRejectedValueOnce(new Error('x'));
    const { user } = renderForm('/gyms/g1', fake);
    await screen.findByLabelText('Gym name');
    await user.click(screen.getByRole('button', { name: 'Make this my default gym' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not change the default/i);
    expect(screen.getByRole('button', { name: 'Make this my default gym' })).toBeInTheDocument();
  });

  it('works on retry after an offline setDefault', async () => {
    const fake = createFakeGymService(notTheDefault);
    fake.failNext('setDefault', 'offline');
    const { user } = renderForm('/gyms/g1', fake);
    await screen.findByLabelText('Gym name');
    await user.click(screen.getByRole('button', { name: 'Make this my default gym' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i);
    await user.click(screen.getByRole('button', { name: 'Make this my default gym' }));
    expect(await screen.findByText('This is your default gym.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes the delete confirmation and shows the failure when remove throws, then allows a retry', async () => {
    const fake = createFakeGymService([ezGym]);
    fake.service.remove.mockRejectedValueOnce(new Error('x'));
    const { user } = renderForm('/gyms/g1', fake);
    await screen.findByLabelText('Gym name');
    await user.click(screen.getByRole('button', { name: 'Delete gym' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not delete/i);
    expect(screen.queryByRole('button', { name: 'Yes, delete' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete gym' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Gyms list')).toBeInTheDocument();
  });

  it('names the gym in the confirmation as plain text, even when the name is markup', async () => {
    const name = '<b>Mine</b>';
    const { user } = renderForm('/gyms/g1', createFakeGymService([sampleGym({ name })]));
    await screen.findByLabelText('Gym name');
    await user.click(screen.getByRole('button', { name: 'Delete gym' }));
    expect(screen.getByText(`Delete ${name}? Its bars go with it.`)).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('a failed save attempt that fails validation replaces the earlier action banner with the field error', async () => {
    const fake = createFakeGymService(notTheDefault);
    fake.failNext('setDefault');
    const { user } = renderForm('/gyms/g1', fake);
    const name = await screen.findByLabelText('Gym name');
    await user.click(screen.getByRole('button', { name: 'Make this my default gym' }));
    await screen.findByRole('alert');
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    // Validation clears the old banner and shows the field error instead.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(name).toBeInvalid();
  });
});
