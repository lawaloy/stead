import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

describe('AccountController', () => {
  const account = {
    getAccount: jest.fn(),
    updateProfile: jest.fn(),
    updateConsents: jest.fn(),
    exportData: jest.fn(),
    deleteAccount: jest.fn(),
  };

  it('forwards the authenticated user to each account operation', async () => {
    const module = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [
        { provide: AccountService, useValue: account },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    const controller = module.get(AccountController);
    const request = { user: { userId: 'user_1', phone: '+2348012345678' } };

    await controller.getAccount(request as never);
    await controller.updateProfile(request as never, { displayName: 'Ada' });
    await controller.updateConsents(request as never, {
      analyticsEnabled: true,
    });
    await controller.exportData(request as never);
    await controller.deleteAccount(request as never, {
      confirmation: 'DELETE',
    });

    expect(account.getAccount).toHaveBeenCalledWith('user_1');
    expect(account.updateProfile).toHaveBeenCalledWith('user_1', {
      displayName: 'Ada',
    });
    expect(account.updateConsents).toHaveBeenCalledWith('user_1', {
      analyticsEnabled: true,
    });
    expect(account.exportData).toHaveBeenCalledWith('user_1');
    expect(account.deleteAccount).toHaveBeenCalledWith('user_1', {
      confirmation: 'DELETE',
    });
  });
});
