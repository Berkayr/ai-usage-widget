"""Local data access restrictions, without third-party dependencies."""
from __future__ import annotations
import os
from pathlib import Path


def restrict_file(path: Path) -> None:
    """0600 on Unix; protected DACL granting only the current SID on Windows.

    Errors are fatal: callers must not silently save secrets with broad access.
    Administrators can still take ownership, and this does not encrypt data.
    """
    if os.name != "nt":
        path.chmod(0o600)
        return
    import ctypes as c
    from ctypes import wintypes as w
    adv = c.WinDLL("advapi32", use_last_error=True)
    kernel = c.WinDLL("kernel32", use_last_error=True)
    adv.OpenProcessToken.argtypes = [w.HANDLE, w.DWORD, c.POINTER(w.HANDLE)]
    adv.GetTokenInformation.argtypes = [w.HANDLE, c.c_int, w.LPVOID, w.DWORD, c.POINTER(w.DWORD)]
    adv.ConvertSidToStringSidW.argtypes = [w.LPVOID, c.POINTER(w.LPWSTR)]
    adv.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [w.LPCWSTR, w.DWORD, c.POINTER(w.LPVOID), c.POINTER(w.DWORD)]
    adv.GetSecurityDescriptorDacl.argtypes = [w.LPVOID, c.POINTER(w.BOOL), c.POINTER(w.LPVOID), c.POINTER(w.BOOL)]
    adv.SetNamedSecurityInfoW.argtypes = [w.LPWSTR, c.c_int, w.DWORD, w.LPVOID, w.LPVOID, w.LPVOID, w.LPVOID]
    kernel.GetCurrentProcess.restype = w.HANDLE
    kernel.CloseHandle.argtypes = [w.HANDLE]
    kernel.LocalFree.argtypes = [w.LPVOID]
    token, sid_text, descriptor = w.HANDLE(), w.LPWSTR(), w.LPVOID()
    def check(ok):
        if not ok:
            raise c.WinError(c.get_last_error())
    try:
        check(adv.OpenProcessToken(kernel.GetCurrentProcess(), 8, c.byref(token)))
        size = w.DWORD()
        adv.GetTokenInformation(token, 1, None, 0, c.byref(size))
        buffer = c.create_string_buffer(size.value)
        check(adv.GetTokenInformation(token, 1, buffer, size, c.byref(size)))
        sid = c.cast(buffer, c.POINTER(w.LPVOID))[0]
        check(adv.ConvertSidToStringSidW(sid, c.byref(sid_text)))
        check(adv.ConvertStringSecurityDescriptorToSecurityDescriptorW(
            "D:P(A;;FA;;;" + sid_text.value + ")", 1, c.byref(descriptor), None))
        present, defaulted, acl = w.BOOL(), w.BOOL(), w.LPVOID()
        check(adv.GetSecurityDescriptorDacl(descriptor, c.byref(present), c.byref(acl), c.byref(defaulted)))
        error = adv.SetNamedSecurityInfoW(str(path), 1, 0x80000004, None, None, acl, None)
        if error:
            raise c.WinError(error)
    finally:
        if descriptor: kernel.LocalFree(descriptor)
        if sid_text: kernel.LocalFree(c.cast(sid_text, w.LPVOID))
        if token: kernel.CloseHandle(token)
