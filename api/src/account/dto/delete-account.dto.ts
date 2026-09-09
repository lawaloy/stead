import { Equals } from 'class-validator';
import type { DeleteAccountRequest } from '../../contracts/generated/types.gen';

export class DeleteAccountDto implements DeleteAccountRequest {
  @Equals('DELETE')
  confirmation!: 'DELETE';
}
