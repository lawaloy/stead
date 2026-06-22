import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CountriesService } from './countries.service';

@Module({
  imports: [PrismaModule],
  providers: [CountriesService],
  exports: [CountriesService],
})
export class CountriesModule {}
