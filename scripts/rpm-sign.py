import os
import pty
import sys

def sign_rpm(rpm_file, passphrase):
    sys.stderr.write(f"[rpm-sign.py] Spawning pty.fork() to sign: {rpm_file}\n")
    sys.stderr.flush()
    
    pid, fd = pty.fork()
    
    if pid == 0:
        # Child process: Replace this process with the rpmsign command
        os.execvp("rpm", ["rpm", "--addsign", rpm_file])
    else:
        # Parent process: Communicate with child through the master PTY (fd)
        output = b""
        passphrase_sent = False
        while True:
            try:
                # Read output from child
                chunk = os.read(fd, 1024)
                if not chunk:
                    sys.stderr.write("[rpm-sign.py] EOF reached on PTY descriptor.\n")
                    sys.stderr.flush()
                    break
                
                # Print stdout to the runner console so we see the build output
                sys.stdout.buffer.write(chunk)
                sys.stdout.flush()
                
                output += chunk
                
                # Log what we read for debugging in the runner output
                sys.stderr.write(f"[rpm-sign.py] PTY Read: {repr(chunk)}\n")
                sys.stderr.flush()
                
                # Check for passphrase prompts from either rpm or gpg
                if not passphrase_sent and (b"Enter pass phrase:" in output or b"passphrase" in output or b"pass phrase:" in output):
                    sys.stderr.write("[rpm-sign.py] Passphrase prompt detected! Sending passphrase to child PTY...\n")
                    sys.stderr.flush()
                    # Write passphrase followed by newline
                    os.write(fd, passphrase.encode() + b"\n")
                    passphrase_sent = True
                    output = b"" # clear buffer
            except OSError as e:
                sys.stderr.write(f"[rpm-sign.py] PTY Read Error: {e}\n")
                sys.stderr.flush()
                break
                
        # Wait for the child to exit
        sys.stderr.write("[rpm-sign.py] Waiting for child process to terminate...\n")
        sys.stderr.flush()
        _, status = os.waitpid(pid, 0)
        
        # Extract exit code
        if os.WIFEXITED(status):
            code = os.WEXITSTATUS(status)
            sys.stderr.write(f"[rpm-sign.py] Child exited with code: {code}\n")
            sys.stderr.flush()
            return code
        else:
            sys.stderr.write("[rpm-sign.py] Child process killed or failed to exit normally.\n")
            sys.stderr.flush()
            return 1 # failed or killed

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: rpm-sign.py <rpm_file> <passphrase>")
        sys.exit(1)
    
    rpm_file = sys.argv[1]
    passphrase = sys.argv[2]
    
    exit_code = sign_rpm(rpm_file, passphrase)
    sys.exit(exit_code)
