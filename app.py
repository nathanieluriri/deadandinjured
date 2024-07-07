import streamlit as st
st.write("# Hello world")

@st.experimental_dialog("Cast your vote")
def vote(item):
    st.write(f"Why is {item} your favorite?")
    reason = st.text_input("Because...")
    if st.button("Submit"):
        st.session_state.vote = {"item": item, "reason": reason}
        st.rerun()

if "vote" not in st.session_state:
    st.write("Vote for your favorite")
    if st.button("A"):
        vote("A")
    if st.button("B"):
        vote("B")
else:
    f"You voted for {st.session_state.vote['item']} because {st.session_state.vote['reason']}"


if "text" not in st.session_state:
    st.session_state.text=False
nig = st.empty()
with nig:
    with st.popover("Set your Unique number"):
        
        big=st.text_input("ENter unique numbers",max_chars=4,type="password",placeholder="1234",disabled=st.session_state.text)
        if big == "1234":
            st.success("Number successfully set")
            if st.button("Yes"):
                st.session_state.text=True
                print(st.session_state.text)
                st.rerun()

            if st.button("No"):
                st.session_state.text=False
                st.rerun()
            
            # nig.balloons()
if "count" not in st.session_state:
    st.session_state.count=0



@st.experimental_fragment(run_every="1s")
def run():
    st.write("J")
    st.session_state.count+=1
    st.write(st.session_state.count)
    if st.session_state.count==25:
        st.rerun()
    elif st.session_state.count==35:
        st.rerun()


run()
