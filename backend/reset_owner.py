"""Break-glass owner password reset — the safe answer to "the owner is locked out".

Run it ON THE SERVER (physical / file access is the authentication). It sets a new
random password for an account and, if that account has a phone on file, prints a
ready-to-click WhatsApp link so the operator can send it. There is deliberately NO
HTTP endpoint for this: an unauthenticated "reset my admin password and text it to
me" route would let anyone lock the owner out and would leak the new password into a
lock-screen preview. Server access is the one credential we trust here.

    python reset_owner.py [username]
"""
import sys
from urllib.parse import quote

from sqlmodel import Session, select

from main import Staff, engine, ensure_columns, new_login_code, pwd


def main() -> None:
    ensure_columns()  # in case the server has not booted since Staff.phone was added
    username = (sys.argv[1] if len(sys.argv) > 1 else input("owner username: ")).strip().lower()
    new = new_login_code(12)  # longer than a patient code — this unlocks the console
    with Session(engine) as db:
        member = db.exec(select(Staff).where(Staff.username == username)).first()
        if not member:
            sys.exit(f"No account '{username}'.")
        role, phone = member.role, member.phone
        member.password_hash = pwd.hash(new)
        db.add(member)
        db.commit()

    if role != "OWNER":
        print(f"Note: '{username}' is {role}, not OWNER.")
    print(f"\n  New password for {username}:  {new}\n")
    if phone:
        msg = (
            f"B-WELL admin login reset.\nUsername: {username}\nPassword: {new}\n\n"
            "Please change it after signing in."
        )
        print(f"  Send on WhatsApp:\n    https://wa.me/91{phone}?text={quote(msg)}\n")
    else:
        print("  No phone on file for this account — deliver the password in person.\n")


if __name__ == "__main__":
    main()
