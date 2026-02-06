import { IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must look like +2348012345678' })
  phone!: string;
}
