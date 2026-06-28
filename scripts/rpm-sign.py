import os
import pty
import sys

def sign_rpm(rpm_file, passphrase):
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
                    break
                
                # Print stdout to the runner console so we see the build output
                sys.stdout.buffer.write(chunk)
                sys.stdout.flush()
                
                output += chunk
                
                # Check for passphrase prompts from either rpm or gpg
                if not passphrase_sent and (b"Enter pass phrase:" in output or b"passphrase" in output or b"pass phrase:" in output):
                    # Write passphrase followed by newline
                    os.write(fd, passphrase.encode() + b"\n")
                    passphrase_sent = True
                    output = b"" # clear buffer
            except OSError:
                break
                
        # Wait for the child to exit
        _, status = os.waitpid(pid, 0)
        
        # Extract exit code
        if os.WIFEXITED(status):
            return os.WEXITSTATUS(status)
        else:
            return 1 # failed or killed

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: rpm-sign.py <rpm_file> <passphrase>")
        sys.exit(1)
    
    rpm_file = sys.argv[1]
    passphrase = sys.argv[2]
    
    exit_code = sign_rpm(rpm_file, passphrase)
    sys.exit(exit_code)
