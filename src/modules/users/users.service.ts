import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async upsertEmailUser(email: string) {
    return this.prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });
  }

  async upsertGoogleUser(email: string, googleSub: string) {
    return this.prisma.user.upsert({
      where: { email },
      create: { email, googleSub },
      update: { googleSub },
    });
  }
}
