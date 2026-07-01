<?php

namespace App\Services;

class StatusCodeService
{
    public const DRAFT = '00';
    public const ACTIVE = '10';
    public const INACTIVE = '90';
    public const DELETED = '99';

    public const PAYMENT_UNPAID = '00';
    public const PAYMENT_PAID = '10';
    public const PAYMENT_FAILED = '20';
    public const PAYMENT_EXPIRED = '30';
    public const PAYMENT_CANCELLED = '99';

    public const ORDER_PENDING_CASHIER = '00';
    public const ORDER_WAITING = '10';
    public const ORDER_PREPARING = '20';
    public const ORDER_READY = '30';
    public const ORDER_COMPLETED = '90';
    public const ORDER_CANCELLED = '99';

    public const INVITATION_PENDING = '00';
    public const INVITATION_SENT = '10';
    public const INVITATION_ACCEPTED = '20';
    public const INVITATION_FAILED = '30';
    public const INVITATION_SUPERSEDED = '90';
    public const INVITATION_EXPIRED = '99';

    public const CONNECTOR_NOT_CONFIGURED = '00';
    public const CONNECTOR_READY = '10';
    public const CONNECTOR_INACTIVE = '90';

    public const RECIPE_DRAFT = '00';
    public const RECIPE_READY = '10';

    public const EXPENSE_DRAFT = '00';
    public const EXPENSE_POSTED = '10';
    public const EXPENSE_VOID = '99';

    public static function common(?string $status, string $default = self::ACTIVE): string
    {
        return self::map($status, [
            'draft' => self::DRAFT,
            'pending' => self::DRAFT,
            'invited' => self::DRAFT,
            'active' => self::ACTIVE,
            'enabled' => self::ACTIVE,
            'ready' => self::ACTIVE,
            'inactive' => self::INACTIVE,
            'disabled' => self::INACTIVE,
            'depleted' => self::INACTIVE,
            'deleted' => self::DELETED,
        ], $default);
    }

    public static function payment(?string $status, string $default = self::PAYMENT_UNPAID): string
    {
        return self::map($status, [
            'unpaid' => self::PAYMENT_UNPAID,
            'pending' => self::PAYMENT_UNPAID,
            'fallback_pending' => self::PAYMENT_UNPAID,
            'paid' => self::PAYMENT_PAID,
            'succeeded' => self::PAYMENT_PAID,
            'settled' => self::PAYMENT_PAID,
            'captured' => self::PAYMENT_PAID,
            'failed' => self::PAYMENT_FAILED,
            'configuration_required' => self::PAYMENT_FAILED,
            'expired' => self::PAYMENT_EXPIRED,
            'cancelled' => self::PAYMENT_CANCELLED,
            'canceled' => self::PAYMENT_CANCELLED,
        ], $default);
    }

    public static function order(?string $status, string $default = self::ORDER_WAITING): string
    {
        return self::map($status, [
            'pending_cashier' => self::ORDER_PENDING_CASHIER,
            'waiting' => self::ORDER_WAITING,
            'preparing' => self::ORDER_PREPARING,
            'ready' => self::ORDER_READY,
            'completed' => self::ORDER_COMPLETED,
            'cancelled' => self::ORDER_CANCELLED,
            'canceled' => self::ORDER_CANCELLED,
        ], $default);
    }

    public static function invitation(?string $status, string $default = self::INVITATION_PENDING): string
    {
        return self::map($status, [
            'pending' => self::INVITATION_PENDING,
            'invited' => self::INVITATION_PENDING,
            'sent' => self::INVITATION_SENT,
            'accepted' => self::INVITATION_ACCEPTED,
            'active' => self::INVITATION_ACCEPTED,
            'send_failed' => self::INVITATION_FAILED,
            'failed' => self::INVITATION_FAILED,
            'superseded' => self::INVITATION_SUPERSEDED,
            'expired' => self::INVITATION_EXPIRED,
            'cancelled' => self::INVITATION_EXPIRED,
        ], $default);
    }

    public static function connector(?string $status, string $default = self::CONNECTOR_NOT_CONFIGURED): string
    {
        return self::map($status, [
            'not_configured' => self::CONNECTOR_NOT_CONFIGURED,
            'configuration_required' => self::CONNECTOR_NOT_CONFIGURED,
            'ready' => self::CONNECTOR_READY,
            'active' => self::CONNECTOR_READY,
            'inactive' => self::CONNECTOR_INACTIVE,
            'connector_not_implemented' => self::CONNECTOR_INACTIVE,
        ], $default);
    }

    public static function recipe(?string $status, string $default = self::RECIPE_DRAFT): string
    {
        return self::map($status, [
            'draft' => self::RECIPE_DRAFT,
            'pending' => self::RECIPE_DRAFT,
            'ready' => self::RECIPE_READY,
            'active' => self::RECIPE_READY,
        ], $default);
    }

    public static function expense(?string $status, string $default = self::EXPENSE_POSTED): string
    {
        return self::map($status, [
            'draft' => self::EXPENSE_DRAFT,
            'posted' => self::EXPENSE_POSTED,
            'active' => self::EXPENSE_POSTED,
            'void' => self::EXPENSE_VOID,
            'cancelled' => self::EXPENSE_VOID,
        ], $default);
    }

    public static function isActive(?string $status): bool
    {
        return self::common($status) === self::ACTIVE;
    }

    public static function isInactive(?string $status): bool
    {
        return self::common($status) === self::INACTIVE;
    }

    public static function isPaid(?string $status): bool
    {
        return self::payment($status) === self::PAYMENT_PAID;
    }

    public static function isUnpaid(?string $status): bool
    {
        return self::payment($status) === self::PAYMENT_UNPAID;
    }

    private static function map(?string $status, array $aliases, string $default): string
    {
        $value = strtolower(trim((string) $status));
        if (preg_match('/^\d{2}$/', $value)) {
            return $value;
        }
        return $aliases[$value] ?? $default;
    }
}
