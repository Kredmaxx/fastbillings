import fs from 'fs';

import type { Request, Response } from 'express';
import type { UserGender } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { hashPassword } from '../utils/password';
import { requireTenantId, requireUserId } from '../lib/tenantScope';
import { isProtectedAccount, USER_TYPE, userTypeLabel } from '../lib/userTypes';

function tryUnlink(filePath: string | undefined): void {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.warn('Could not unlink upload', filePath, err);
  }
}

export async function createStaffUser(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const invitedBy = requireUserId(req);
    const {
      firstName,
      lastName,
      email,
      phone,
      gender,
      dateOfBirth,
      password,
      address,
      country,
      state,
      city,
      postalCode,
      roleId,
    } = req.body as {
      firstName: string;
      lastName?: string;
      email: string;
      phone?: string;
      gender?: UserGender;
      dateOfBirth?: string;
      password: string;
      address?: string;
      country?: string;
      state?: string;
      city?: string;
      postalCode?: string;
      roleId: string;
    };

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      tryUnlink(req.file?.path);
      res.status(400).json({
        success: false,
        message: 'Email is already registered',
      });
      return;
    }

    const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) {
      tryUnlink(req.file?.path);
      res.status(404).json({
        success: false,
        message: 'Role not found',
      });
      return;
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
          gender: gender as UserGender | undefined,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          password: hashedPassword,
          address,
          countryId: country,
          stateId: state,
          cityId: city,
          postalCode,
          user_type: 3,
          roleId,
          profileImage: req.file ? req.file.path : null,
        },
      });

      await tx.tenantMembership.create({
        data: {
          tenantId,
          userId: created.id,
          role: 'MEMBER',
          roleId,
          invitedBy,
          acceptedAt: new Date(),
        },
      });

      return created;
    });

    res.status(201).json({
      success: true,
      message: 'Staff user created successfully',
      data: {
        id: newUser.id,
        name: `${newUser.firstName} ${newUser.lastName ?? ''}`.trim(),
        email: newUser.email,
        role: role.roleName,
        profileImage: newUser.profileImage
          ? `${req.protocol}://${req.get('host')}/${newUser.profileImage.replace(/\\/g, '/')}`
          : null,
      },
    });
  } catch (err) {
    console.error('Staff creation error:', err);
    tryUnlink(req.file?.path);
    res.status(500).json({
      success: false,
      message: 'Error creating staff user',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Human-readable label for each user_type integer. */
export async function listStaffUsers(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const page = parseInt(String(req.query.page ?? 1), 10);
    const limit = parseInt(String(req.query.limit ?? 10), 10);
    const search = ((req.query.search as string) ?? '').trim();

    // Optional filter by user_type (allows callers that previously relied on
    // type=3-only behaviour to pass ?user_type=3; without it all non-999 users
    // are returned).
    // Guard: if the param is not a valid integer (e.g. ?user_type=abc), ignore
    // the filter entirely rather than passing NaN to Prisma.
    const userTypeParam = req.query.user_type as string | undefined;
    const userTypeParsed = userTypeParam !== undefined ? parseInt(userTypeParam, 10) : undefined;
    const userTypeFilter = userTypeParsed !== undefined && !isNaN(userTypeParsed) ? userTypeParsed : undefined;

    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId },
      select: { userId: true },
    });

    // Exclude sys-bootstrap (type 999). Optionally narrow to a specific type.
    const where: Prisma.UserWhereInput = {
      id: { in: memberships.map((membership) => membership.userId) },
      NOT: { user_type: { in: [USER_TYPE.SYSTEM, USER_TYPE.SUPER_ADMIN] } },
      ...(userTypeFilter !== undefined ? { user_type: userTypeFilter } : {}),
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { firstName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          role: { select: { id: true, roleName: true } },
        },
      }),
    ]);

    const formattedUsers = users.map((user) => ({
      id: user.id,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phone || '',
      gender: user.gender || '',
      dateOfBirth: user.dateOfBirth || null,
      address: user.address || '',
      user_type: user.user_type,
      userTypeLabel: userTypeLabel(user.user_type),
      roleid: user.role ? user.role.id : '',
      roleName: user.role ? user.role.roleName : 'N/A',
      profileImage: user.profileImage
        ? `${req.protocol}://${req.get('host')}/${user.profileImage.replace(/\\/g, '/')}`
        : null,
      createdAt: user.createdAt,
    }));

    res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: {
        users: formattedUsers,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updateStaffUser(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const {
      firstName,
      lastName,
      email,
      phone,
      gender,
      dateOfBirth,
      password,
      address,
      country,
      state,
      city,
      postalCode,
      roleId,
    } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      gender?: UserGender;
      dateOfBirth?: string;
      password?: string;
      address?: string;
      country?: string;
      state?: string;
      city?: string;
      postalCode?: string;
      roleId?: string;
    };

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: id },
      include: { user: true },
    });
    const user = membership?.user;
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Staff user not found',
      });
      return;
    }

    // Guard: cannot edit platform super admin or tenant admin accounts.
    if (isProtectedAccount(user.user_type)) {
      res.status(403).json({
        success: false,
        message: 'Protected admin accounts cannot be edited.',
      });
      return;
    }

    // Check for email conflict if email is being updated
    if (email && email !== user.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash) {
        res.status(400).json({
          success: false,
          message: 'Email is already registered',
        });
        return;
      }
    }

    // Check role validity
    if (roleId) {
      const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
      if (!role) {
        res.status(404).json({
          success: false,
          message: 'Role not found',
        });
        return;
      }
    }

    const data: Prisma.UserUpdateInput = {
      firstName: firstName || user.firstName,
      lastName: lastName || user.lastName,
      email: email || user.email,
      phone: phone || user.phone,
      gender: (gender as UserGender | undefined) || user.gender || undefined,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : user.dateOfBirth || undefined,
      address: address || user.address,
      postalCode: postalCode || user.postalCode,
    };

    if (country) {
      data.country = { connect: { id: country } };
    }
    if (state) {
      data.state = { connect: { id: state } };
    }
    if (city) {
      data.city = { connect: { id: city } };
    }
    if (roleId) {
      data.role = { connect: { id: roleId } };
    }

    // Update password if provided
    if (password) {
      data.password = await hashPassword(password);
    }

    // Update profile image if a new one is uploaded
    if (req.file) {
      if (user.profileImage && fs.existsSync(user.profileImage)) {
        fs.unlinkSync(user.profileImage);
      }
      data.profileImage = req.file.path;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
    });

    if (roleId) {
      await prisma.tenantMembership.update({
        where: { id: membership.id },
        data: { roleId },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Staff user updated successfully',
      data: updated,
    });
  } catch (err) {
    console.error('Error updating staff user:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating staff user',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deleteStaffUser(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: id },
      include: { user: true },
    });
    const user = membership?.user;
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Guard: cannot delete platform super admin or tenant admin accounts.
    if (isProtectedAccount(user.user_type)) {
      res.status(403).json({
        success: false,
        message: 'Protected admin accounts cannot be deleted.',
      });
      return;
    }

    await prisma.tenantMembership.delete({ where: { id: membership.id } });

    res.status(200).json({
      success: true,
      message: 'Staff user removed from tenant successfully',
    });
  } catch (err) {
    console.error('Error deleting staff user:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting staff user',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes that still use module-alias requires.
module.exports = {
  createStaffUser,
  listStaffUsers,
  updateStaffUser,
  deleteStaffUser,
};
module.exports.createStaffUser = createStaffUser;
module.exports.listStaffUsers = listStaffUsers;
module.exports.updateStaffUser = updateStaffUser;
module.exports.deleteStaffUser = deleteStaffUser;
