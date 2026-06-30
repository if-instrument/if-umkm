<?php

namespace App\Models;

class UserInvitationModel extends BaseAppModel
{
    protected $table = 'user_invitations';
    protected $primaryKey = 'id';
    protected $allowedFields = [
        'company_id', 'user_id', 'email', 'token_hash', 'expires_at',
        'accepted_at', 'sent_at', 'status',
    ];
}
